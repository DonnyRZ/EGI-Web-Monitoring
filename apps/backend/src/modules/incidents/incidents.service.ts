import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentStatus, Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toIncidentDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { IncidentsQueryDto, UpdateIncidentDto } from "./incidents.dto";
import { canOperateScopedResources, websiteOwnerScope } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";

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
    if (user.role === "pic_web") where.website = websiteOwnerScope(user);
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

  async get(id: string, user: AuthUser) {
    this.assertOperational(user);
    const incident = await this.prisma.incident.findFirst({ where: { id, ...(user.role === "pic_web" ? { website: websiteOwnerScope(user) } : {}) } });
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
}
