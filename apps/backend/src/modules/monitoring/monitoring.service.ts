import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toMonitoringResultDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { createScreenshotSignedUrl } from "../../common/s3";
import { MonitoringHistoryQueryDto } from "./monitoring.dto";

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertWebsite(websiteId: string) {
    const website = await this.prisma.website.findUnique({ where: { id: websiteId } });
    if (!website) throw new NotFoundException("Website not found");
  }

  async listByWebsite(
    websiteId: string,
    pagination: PaginationQueryDto,
    filters: MonitoringHistoryQueryDto,
  ) {
    await this.assertWebsite(websiteId);

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

  async latest(websiteId: string) {
    await this.assertWebsite(websiteId);
    const result = await this.prisma.monitoringResult.findFirst({
      where: { websiteId },
      orderBy: { scheduledAt: "desc" },
    });
    if (!result) throw new NotFoundException("No monitoring result yet");
    return toMonitoringResultDto(result);
  }

  async get(id: string) {
    const result = await this.prisma.monitoringResult.findUnique({ where: { id } });
    if (!result) throw new NotFoundException("Monitoring result not found");
    return toMonitoringResultDto(result);
  }

  async getScreenshotSignedUrl(id: string) {
    const result = await this.prisma.monitoringResult.findUnique({ where: { id } });
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
