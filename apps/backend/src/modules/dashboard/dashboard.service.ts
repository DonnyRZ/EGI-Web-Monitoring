import { Injectable, NotFoundException } from "@nestjs/common";
import { IncidentStatus } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import {
  toIncidentDto,
  toMonitoringResultDto,
  toWebsiteDto,
} from "../../common/mappers";

const ACTIVE_STATUSES = [
  IncidentStatus.open,
  IncidentStatus.in_progress,
  IncidentStatus.resolved,
] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async main() {
    const websites = await this.prisma.website.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    const data = await Promise.all(
      websites.map(async (website) => {
        const [latestResult, activeIncident] = await Promise.all([
          this.prisma.monitoringResult.findFirst({
            where: { websiteId: website.id },
            orderBy: { scheduledAt: "desc" },
          }),
          this.prisma.incident.findFirst({
            where: {
              websiteId: website.id,
              status: { in: [...ACTIVE_STATUSES] },
            },
            orderBy: { startedAt: "desc" },
          }),
        ]);

        return {
          website: toWebsiteDto(website),
          latest_result: latestResult ? toMonitoringResultDto(latestResult) : null,
          active_incident: activeIncident ? toIncidentDto(activeIncident) : null,
        };
      }),
    );

    return { data };
  }

  async detail(websiteId: string, historyLimit: number) {
    const website = await this.prisma.website.findUnique({ where: { id: websiteId } });
    if (!website) throw new NotFoundException("Website not found");

    const [latestResult, monitoringHistory, activeIncident, incidentHistory] =
      await Promise.all([
        this.prisma.monitoringResult.findFirst({
          where: { websiteId },
          orderBy: { scheduledAt: "desc" },
        }),
        this.prisma.monitoringResult.findMany({
          where: { websiteId },
          orderBy: { scheduledAt: "desc" },
          take: historyLimit,
        }),
        this.prisma.incident.findFirst({
          where: {
            websiteId,
            status: { in: [...ACTIVE_STATUSES] },
          },
          orderBy: { startedAt: "desc" },
        }),
        this.prisma.incident.findMany({
          where: { websiteId },
          orderBy: { startedAt: "desc" },
          take: 50,
        }),
      ]);

    return {
      website: toWebsiteDto(website),
      latest_result: latestResult ? toMonitoringResultDto(latestResult) : null,
      monitoring_history: monitoringHistory.map(toMonitoringResultDto),
      active_incident: activeIncident ? toIncidentDto(activeIncident) : null,
      incident_history: incidentHistory.map(toIncidentDto),
    };
  }
}
