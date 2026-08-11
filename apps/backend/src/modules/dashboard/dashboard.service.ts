import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentStatus, MonitoringStatus } from "@egi/database";
import { isEndUserPublicDashboard } from "@egi/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import {
  toIncidentDto,
  toMonitoringResultDto,
  toWebsiteDto,
} from "../../common/mappers";
import { canOperateScopedResources, websiteOwnerScope } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";

const ACTIVE_STATUSES = [
  IncidentStatus.open,
  IncidentStatus.in_progress,
] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async main(user: AuthUser) {
    const websites = await this.prisma.website.findMany({
      where: { isActive: true, ...websiteOwnerScope(user) },
      orderBy: { name: "asc" },
      include: {
        monitoringResults: {
          orderBy: { checkedAt: "desc" },
          take: 1,
        },
        incidents: {
          where: { status: { in: [...ACTIVE_STATUSES] } },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const endUserView = isEndUserPublicDashboard(user.role);

    const data = websites
      .map((website) => {
        const latestResult = website.monitoringResults[0] ?? null;
        const activeIncident = website.incidents[0] ?? null;
        return {
          website: toWebsiteDto(website),
          latest_result: latestResult ? toMonitoringResultDto(latestResult) : null,
          active_incident: activeIncident ? toIncidentDto(activeIncident) : null,
        };
      })
      .filter((card) => {
        if (!endUserView) return true;
        // Public gallery: hide inactive (already), down, and unknown.
        const status = card.latest_result?.status;
        return (
          status != null &&
          status !== MonitoringStatus.down &&
          status !== MonitoringStatus.unknown
        );
      });

    return { data };
  }

  async detail(websiteId: string, historyLimit: number, user: AuthUser) {
    if (!canOperateScopedResources(user)) {
      throw new ForbiddenException("Monitoring detail requires an operational role");
    }

    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, ...websiteOwnerScope(user) },
    });
    if (!website) throw new NotFoundException("Website not found");

    const [latestResult, monitoringHistory, activeIncident, incidentHistory] =
      await Promise.all([
        this.prisma.monitoringResult.findFirst({
          where: { websiteId },
          orderBy: { checkedAt: "desc" },
        }),
        this.prisma.monitoringResult.findMany({
          where: { websiteId },
          orderBy: { checkedAt: "desc" },
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
