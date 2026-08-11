import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, Severity, TicketCategory, TicketStatus } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toTicketDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { CreateTicketDto, TicketsQueryDto, UpdateTicketDto } from "./tickets.dto";
import { canOperateScopedResources } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";
import { uploadObject } from "../../common/s3";

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOperational(user: AuthUser) {
    if (!canOperateScopedResources(user)) {
      throw new ForbiddenException("Tickets require an operational role");
    }
  }

  private async assertWebsiteAccess(websiteId: string, user: AuthUser) {
    const website = await this.prisma.website.findUnique({ where: { id: websiteId } });
    if (!website) throw new NotFoundException("Website not found");
    if (user.role === "pic_web" && website.ownerId !== user.id) {
      throw new ForbiddenException("You can only use tickets for your assigned websites");
    }
    return website;
  }

  async list(pagination: PaginationQueryDto, filters: TicketsQueryDto, user: AuthUser) {
    this.assertOperational(user);

    const where: Prisma.TicketWhereInput = {};
    if (filters.incident_id) where.incidentId = filters.incident_id;
    if (filters.website_id) where.websiteId = filters.website_id;
    if (filters.assigned_to) where.assignedTo = filters.assigned_to;
    if (filters.status) where.status = filters.status;
    if (user.role === "pic_web") where.website = { ownerId: user.id };

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

  async uploadAttachment(file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, user: AuthUser) {
    this.assertOperational(user);
    if (!file || file.size > 10 * 1024 * 1024) {
      throw new BadRequestException("Attachment must be smaller than 10 MB");
    }
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `tickets/${user.id}/${randomUUID()}-${safeName}`;
    await uploadObject(key, file.buffer, file.mimetype || "application/octet-stream");
    return { attachment_url: key };
  }

  async create(dto: CreateTicketDto, user: AuthUser) {
    this.assertOperational(user);
    if (!dto.incident_id && !dto.website_id) {
      throw new BadRequestException("website_id is required for a new ticket");
    }
    if (!dto.incident_id && (!dto.category || !dto.description?.trim())) {
      throw new BadRequestException("category and description are required for a new ticket");
    }
    if (dto.website_id) await this.assertWebsiteAccess(dto.website_id, user);

    if (dto.incident_id) {
      const incident = await this.prisma.incident.findUnique({ where: { id: dto.incident_id } });
      if (!incident) throw new NotFoundException("Incident not found");
    }

    const title = dto.title?.trim() || this.titleForCategory(dto.category);
    const ticket = await this.prisma.ticket.create({
      data: {
        incidentId: dto.incident_id,
        websiteId: dto.website_id,
        createdBy: user.id,
        title,
        category: dto.category,
        description: dto.description?.trim(),
        attachmentUrl: dto.attachment_url,
        assignedTo: dto.assigned_to,
        priority: dto.priority ?? Severity.medium,
        status: TicketStatus.open,
      },
    });
    return toTicketDto(ticket);
  }

  private titleForCategory(category?: TicketCategory) {
    switch (category) {
      case TicketCategory.website: return "Permintaan Website";
      case TicketCategory.help_desk: return "Permintaan Help Desk";
      case TicketCategory.procurement: return "Permintaan Procurement";
      default: return "Tiket Baru";
    }
  }

  async get(id: string, user: AuthUser) {
    this.assertOperational(user);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...(user.role === "pic_web" ? { website: { ownerId: user.id } } : {}) },
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
