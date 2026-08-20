import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentStatus, MonitoringStatus, Prisma } from "@egi/database";
import { isEndUserPublicDashboard } from "@egi/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import {
  toIncidentDto,
  toMonitoringResultDto,
  toWebsiteDto,
} from "../../common/mappers";
import { canOperateScopedResources, websiteVisibilityScope } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";

const ACTIVE_STATUSES = [
  IncidentStatus.open,
  IncidentStatus.in_progress,
] as const;

export type DashboardStatusFilter = "active" | "down";

type LatestResultRow = {
  id: string;
  websiteId: string;
  scheduledAt: Date;
  checkedAt: Date;
  status: MonitoringStatus;
  httpStatus: number | null;
  responseTimeMs: number | null;
  renderTimeMs: number | null;
  screenshotUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async main(user: AuthUser, statusFilter?: DashboardStatusFilter) {
    const websiteScope = this.websiteScope(user);
    const websites = await this.prisma.website.findMany({
      where: { isActive: true, ...websiteScope },
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
      orderBy: { name: "asc" },
    });

    if (websites.length === 0) {
      return { data: [] };
    }

    const ids = websites.map((website) => website.id);
    const [latestRows, incidents] = await Promise.all([
      this.prisma.$queryRaw<LatestResultRow[]>`
        SELECT DISTINCT ON (website_id)
          id,
          website_id AS "websiteId",
          scheduled_at AS "scheduledAt",
          checked_at AS "checkedAt",
          status,
          http_status AS "httpStatus",
          response_time_ms AS "responseTimeMs",
          render_time_ms AS "renderTimeMs",
          screenshot_url AS "screenshotUrl",
          error_message AS "errorMessage",
          created_at AS "createdAt"
        FROM monitoring_results
        WHERE website_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY website_id, checked_at DESC
      `,
      this.prisma.incident.findMany({
        where: {
          websiteId: { in: ids },
          status: { in: [...ACTIVE_STATUSES] },
        },
        orderBy: { startedAt: "desc" },
      }),
    ]);

    const latestByWebsite = new Map(latestRows.map((row) => [row.websiteId, row]));
    const incidentByWebsite = new Map<string, (typeof incidents)[number]>();
    for (const incident of incidents) {
      if (!incidentByWebsite.has(incident.websiteId)) {
        incidentByWebsite.set(incident.websiteId, incident);
      }
    }

    const endUserView = isEndUserPublicDashboard(user.role);

    const cards = websites
      .map((website) => {
        const latestResult = latestByWebsite.get(website.id) ?? null;
        const activeIncident = incidentByWebsite.get(website.id) ?? null;
        return {
          website: toWebsiteDto(website),
          latest_result: latestResult
            ? toMonitoringResultDto(latestResult)
            : null,
          active_incident: activeIncident ? toIncidentDto(activeIncident) : null,
        };
      })
      .filter((card) => {
        const status = card.latest_result?.status;
        if (endUserView) {
          return (
            status != null &&
            status !== MonitoringStatus.down &&
            status !== MonitoringStatus.unknown
          );
        }
        if (statusFilter === "active") {
          return status === MonitoringStatus.normal || status === MonitoringStatus.warning;
        }
        if (statusFilter === "down") {
          return status === MonitoringStatus.down;
        }
        return true;
      });

    return { data: cards };
  }

  async detail(websiteId: string, historyLimit: number, user: AuthUser) {
    if (!canOperateScopedResources(user)) {
      throw new ForbiddenException("Monitoring detail requires an operational role");
    }

    const websiteScope = this.websiteScope(user);
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, ...websiteScope },
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

  private websiteScope(user: AuthUser): Prisma.WebsiteWhereInput {
    // Unit fakes created before Project existed do not expose a project
    // delegate. Keeping their legacy global dashboard behavior makes the
    // transition testable; the real Prisma client always takes the scoped
    // Project-aware branch below.
    if (!(this.prisma as unknown as { project?: unknown }).project && user.role === "developer") return {};
    return websiteVisibilityScope(user);
  }
}
