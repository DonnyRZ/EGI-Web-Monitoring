import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toMonitoringResultDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { createScreenshotSignedUrl } from "../../common/s3";
import { MonitoringHistoryQueryDto } from "./monitoring.dto";
import { canAccessAllMonitoredResources } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertWebsite(websiteId: string, user: AuthUser) {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, ...(canAccessAllMonitoredResources(user) ? {} : { ownerId: user.id }) },
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
    const result = await this.prisma.monitoringResult.findFirst({
      where: { id, ...(canAccessAllMonitoredResources(user) ? {} : { website: { ownerId: user.id } }) },
    });
    if (!result) throw new NotFoundException("Monitoring result not found");
    return toMonitoringResultDto(result);
  }

  async getScreenshotSignedUrl(id: string, user: AuthUser) {
    const result = await this.prisma.monitoringResult.findFirst({
      where: { id, ...(canAccessAllMonitoredResources(user) ? {} : { website: { ownerId: user.id } }) },
    });
    if (!result) throw new NotFoundException("Monitoring result not found");
    if (!result.screenshotUrl) {
      throw new NotFoundException("Screenshot not available");
    }

    const signed = await createScreenshotSignedUrl(result.screenshotUrl);
    return {
      url: signed.url,
      expires_at: signed.expiresAt,
    };
  }
}
