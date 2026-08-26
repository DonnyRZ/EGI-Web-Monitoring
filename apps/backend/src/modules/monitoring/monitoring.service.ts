import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toMonitoringResultDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { MonitoringHistoryQueryDto } from "./monitoring.dto";
import { canOperateScopedResources, monitoringResultScope, websiteVisibilityScope } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOperational(user: AuthUser) {
    if (!canOperateScopedResources(user)) {
      throw new ForbiddenException("Monitoring results require an operational role");
    }
  }

  private async assertWebsite(websiteId: string, user: AuthUser) {
    this.assertOperational(user);
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, ...websiteVisibilityScope(user) },
    });
    if (!website) throw new NotFoundException("Website not found");
  }

  async listByWebsite(
    websiteId: string,
    pagination: PaginationQueryDto,
    filters: MonitoringHistoryQueryDto,
    user: AuthUser,
  ) {
    await this.assertWebsite(websiteId, user);

    const where: Prisma.MonitoringResultWhereInput = { websiteId };
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.scheduledAt = {};
      if (filters.from) where.scheduledAt.gte = new Date(filters.from);
      if (filters.to) where.scheduledAt.lte = new Date(filters.to);
    }

    const [total, results] = await this.prisma.$transaction([
      this.prisma.monitoringResult.count({ where }),
      this.prisma.monitoringResult.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { scheduledAt: "desc" },
      }),
    ]);

    return {
      data: results.map(toMonitoringResultDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async latest(websiteId: string, user: AuthUser) {
    await this.assertWebsite(websiteId, user);
    const result = await this.prisma.monitoringResult.findFirst({
      where: { websiteId },
      orderBy: { checkedAt: "desc" },
    });
    if (!result) throw new NotFoundException("No monitoring result yet");
    return toMonitoringResultDto(result);
  }

  async get(id: string, user: AuthUser) {
    // Dashboard cards (including end_user) need health-result access for active sites.
    const result = await this.prisma.monitoringResult.findFirst({
      where: {
        id,
        ...monitoringResultScope(user),
      },
    });
    if (!result) throw new NotFoundException("Monitoring result not found");
    return toMonitoringResultDto(result);
  }

}
