import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentStatus, Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toIncidentDto, toTicketDto, toWebsiteDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { IncidentsQueryDto, UpdateIncidentDto } from "./incidents.dto";
import { canOperateScopedResources, websiteVisibilityScope } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";

const CONTEXT_TICKET_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  storyLinks: { select: { userStoryId: true } },
} as const;

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOperational(user: AuthUser) {
    if (!canOperateScopedResources(user)) {
      throw new ForbiddenException("Incidents require an operational role");
    }
  }

  async list(pagination: PaginationQueryDto, filters: IncidentsQueryDto, user: AuthUser) {
    this.assertOperational(user);

    const where: Prisma.IncidentWhereInput = {};
    if (filters.website_id) where.websiteId = filters.website_id;
    if (user.role === "pic_web" || user.role === "developer") where.website = websiteVisibilityScope(user);
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.active_only) {
      where.status = {
        in: [IncidentStatus.open, IncidentStatus.in_progress],
      };
    }

    const [total, incidents] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { startedAt: "desc" },
      }),
    ]);

    return {
      data: incidents.map(toIncidentDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async activeCount(user: AuthUser) {
    this.assertOperational(user);
    const where: Prisma.IncidentWhereInput = {
      status: { in: [IncidentStatus.open, IncidentStatus.in_progress] },
      ...(user.role === "pic_web" || user.role === "developer"
        ? { website: websiteVisibilityScope(user) }
        : {}),
    };
    return { count: await this.prisma.incident.count({ where }) };
  }

  async context(id: string, user: AuthUser) {
    this.assertOperational(user);
    const incident = await this.prisma.incident.findFirst({
      where: {
        id,
        ...(user.role === "pic_web" || user.role === "developer"
          ? { website: websiteVisibilityScope(user) }
          : {}),
      },
    });
    if (!incident) throw new NotFoundException("Incident not found");

    const [website, tickets] = await Promise.all([
      this.prisma.website.findFirst({
        where: { id: incident.websiteId, ...websiteVisibilityScope(user) },
        select: {
          id: true,
          name: true,
          domain: true,
          url: true,
          projectId: true,
          ownerId: true,
          itPicId: true,
          backupItPicId: true,
          monitoringIntervalMinutes: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: { incidentId: id, ...this.ticketReadScope(user) },
        include: CONTEXT_TICKET_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      incident: toIncidentDto(incident),
      website: website ? toWebsiteDto(website) : null,
      tickets: tickets.map(toTicketDto),
    };
  }

  async get(id: string, user: AuthUser) {
    this.assertOperational(user);
    const incident = await this.prisma.incident.findFirst({
      where: {
        id,
        ...(user.role === "pic_web" || user.role === "developer"
          ? { website: websiteVisibilityScope(user) }
          : {}),
      },
    });
    if (!incident) throw new NotFoundException("Incident not found");
    return toIncidentDto(incident);
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Incident not found");
    if (dto.status === IncidentStatus.closed) {
      throw new BadRequestException("Use POST /incidents/:id/close to close an incident");
    }
    if (existing.status === IncidentStatus.closed) {
      throw new BadRequestException("Closed incidents cannot be updated");
    }
    if (dto.status === IncidentStatus.open && existing.status !== IncidentStatus.open) {
      throw new BadRequestException("Resolved incidents must create a new lifecycle, not reopen");
    }
    const incident = await this.prisma.incident.update({
      where: { id },
      data: {
        title: dto.title,
        severity: dto.severity,
        status: dto.status,
        resolvedAt:
          dto.status === IncidentStatus.resolved && !existing.resolvedAt
            ? new Date()
            : undefined,
      },
    });
    return toIncidentDto(incident);
  }

  async close(id: string) {
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Incident not found");
    if (existing.status === IncidentStatus.closed) {
      throw new BadRequestException("Incident already closed");
    }
    if (existing.status !== IncidentStatus.resolved) {
      throw new BadRequestException("Only resolved incidents can be closed");
    }

    const incident = await this.prisma.incident.update({
      where: { id },
      data: {
        status: IncidentStatus.closed,
        closedAt: new Date(),
      },
    });
    return toIncidentDto(incident);
  }

  private ticketReadScope(user: AuthUser): Prisma.TicketWhereInput {
    if (user.role === "pic_web") {
      return {
        OR: [
          { project: { members: { some: { userId: user.id, memberType: "pic_web" } } } },
          { projectId: null, website: { ownerId: user.id } },
        ],
      };
    }
    if (user.role === "developer") {
      return {
        OR: [
          { assignedTo: user.id },
          { project: { picDeveloperId: user.id } },
          { userStory: { OR: [{ primaryDeveloperId: user.id }, { collaborators: { some: { userId: user.id } } }] } },
          { storyLinks: { some: { userStory: { OR: [{ primaryDeveloperId: user.id }, { collaborators: { some: { userId: user.id } } }] } } } },
        ],
      };
    }
    return {};
  }
}
