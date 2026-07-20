import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TicketStatus } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toTicketDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { CreateTicketDto, TicketsQueryDto, UpdateTicketDto } from "./tickets.dto";
import { canAccessAllMonitoredResources } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationQueryDto, filters: TicketsQueryDto, user: AuthUser) {
    const where: Prisma.TicketWhereInput = {};
    if (filters.incident_id) where.incidentId = filters.incident_id;
    if (filters.assigned_to) where.assignedTo = filters.assigned_to;
    if (filters.status) where.status = filters.status;
    if (!canAccessAllMonitoredResources(user)) {
      where.incident = { website: { ownerId: user.id } };
    }

    const [total, tickets] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      data: tickets.map(toTicketDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async create(dto: CreateTicketDto) {
    const incident = await this.prisma.incident.findUnique({ where: { id: dto.incident_id } });
    if (!incident) throw new NotFoundException("Incident not found");

    const ticket = await this.prisma.ticket.create({
      data: {
        incidentId: dto.incident_id,
        title: dto.title,
        assignedTo: dto.assigned_to,
        priority: dto.priority,
        status: TicketStatus.open,
      },
    });
    return toTicketDto(ticket);
  }

  async get(id: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        ...(canAccessAllMonitoredResources(user) ? {} : { incident: { website: { ownerId: user.id } } }),
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return toTicketDto(ticket);
  }

  async update(id: string, dto: UpdateTicketDto) {
    const existing = await this.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Ticket not found");
    if (existing.status === TicketStatus.closed) {
      throw new BadRequestException("Closed tickets cannot be updated");
    }
    if (dto.status === TicketStatus.open && existing.status !== TicketStatus.open) {
      throw new BadRequestException("Resolved tickets cannot be reopened");
    }
    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: {
        title: dto.title,
        assignedTo: dto.assigned_to,
        priority: dto.priority,
        status: dto.status,
        resolvedAt:
          (dto.status === TicketStatus.resolved || dto.status === TicketStatus.closed) && !existing.resolvedAt
            ? new Date()
            : undefined,
      },
    });
    return toTicketDto(ticket);
  }
}
