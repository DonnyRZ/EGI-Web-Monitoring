import {
  IncidentStatus,
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
  Severity,
  TicketStatus,
  UserRole,
} from "@egi/database";
import {
  applyCardStatusOverride,
  deriveCheckStatus,
  evaluateIncidentRules,
  type CheckProbeResult,
} from "@egi/monitoring-rules";
import type { MonitoringStatus } from "@egi/shared-types";
import { log, jobMeta } from "./log";

const ACTIVE_INCIDENT: IncidentStatus[] = [
  IncidentStatus.open,
  IncidentStatus.in_progress,
];

export interface PersistCheckInput {
  prisma: PrismaClient;
  jobId?: string;
  websiteId: string;
  websiteName: string;
  scheduledAt: Date;
  probe: CheckProbeResult;
  screenshotUrl: string | null;
  enqueueNotification: (notificationId: string) => Promise<void>;
}

export async function persistCheckAndEvaluate(
  input: PersistCheckInput,
): Promise<{ resultId: string; status: MonitoringStatus }> {
  const { prisma, websiteId, scheduledAt, probe, screenshotUrl } = input;
  const checkedAt = new Date();

  const checkStatus = deriveCheckStatus(probe);

  const previous = await prisma.monitoringResult.findMany({
    where: { websiteId },
    orderBy: { scheduledAt: "desc" },
    take: 5,
    select: { status: true },
  });

  // recentStatuses newest-first including current checkStatus (pre-override)
  const recentForRules: MonitoringStatus[] = [
    checkStatus,
    ...previous.map((p) => p.status as MonitoringStatus),
  ];

  const activeIncident = await prisma.incident.findFirst({
    where: { websiteId, status: { in: ACTIVE_INCIDENT } },
    orderBy: { startedAt: "desc" },
  });

  const action = evaluateIncidentRules({
    recentStatuses: recentForRules,
    hasActiveIncident: Boolean(activeIncident),
  });

  const finalStatus = applyCardStatusOverride(checkStatus, action);

  let result;
  try {
    result = await prisma.monitoringResult.create({
      data: {
        websiteId,
        scheduledAt,
        checkedAt,
        status: finalStatus,
        httpStatus: probe.httpStatus,
        responseTimeMs: probe.responseTimeMs,
        renderTimeMs: probe.renderTimeMs,
        screenshotUrl,
        errorMessage: probe.errorMessage,
      },
    });
  } catch (error) {
    // Unique constraint → already processed (idempotent)
    const existing = await prisma.monitoringResult.findUnique({
      where: {
        websiteId_scheduledAt: { websiteId, scheduledAt },
      },
    });
    if (existing) {
      log(
        "result_already_exists",
        jobMeta(input.jobId, websiteId, scheduledAt.toISOString(), {
          result_id: existing.id,
        }),
      );
      return { resultId: existing.id, status: existing.status as MonitoringStatus };
    }
    throw error;
  }

  log(
    "result_saved",
    jobMeta(input.jobId, websiteId, scheduledAt.toISOString(), {
      result_id: result.id,
      status: finalStatus,
      check_status: checkStatus,
      action: action.type,
    }),
  );

  if (action.type === "create_incident") {
    await createIncidentFlow(input, action.severity, action.titleHint);
  } else if (action.type === "resolve_incident" && activeIncident) {
    await resolveIncidentFlow(input, activeIncident.id);
  }

  return { resultId: result.id, status: finalStatus };
}

async function createIncidentFlow(
  input: PersistCheckInput,
  severity: Severity,
  titleHint: string,
): Promise<void> {
  const { prisma, websiteId, websiteName } = input;

  const created = await prisma.$transaction(async (tx) => {
    // PostgreSQL advisory locks serialize incident creation for one website
    // even when multiple workers receive overlapping jobs.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${websiteId}))
    `;

    const existing = await tx.incident.findFirst({
      where: { websiteId, status: { in: ACTIVE_INCIDENT } },
    });
    if (existing) return null;

    const title = `Website ${websiteName} ${titleHint}`;
    const incident = await tx.incident.create({
      data: {
        websiteId,
        title,
        severity,
        status: IncidentStatus.open,
        startedAt: input.scheduledAt,
      },
    });

    const assignees = await tx.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.it_ops, UserRole.helpdesk] },
      },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
    const assignee = assignees[0] ?? null;

    const ticket = await tx.ticket.create({
      data: {
        incidentId: incident.id,
        title: `Periksa penyebab: ${websiteName}`,
        assignedTo: assignee?.id ?? null,
        priority: severity,
        status: TicketStatus.open,
      },
    });

    return { incident, ticket, assignee, title };
  });

  if (!created) {
    log(
      "incident_skipped_duplicate",
      jobMeta(input.jobId, websiteId, input.scheduledAt.toISOString(), {
      }),
    );
    return;
  }

  log(
    "incident_created",
    jobMeta(input.jobId, websiteId, input.scheduledAt.toISOString(), {
      incident_id: created.incident.id,
      severity,
    }),
  );

  await createLifecycleNotifications(input, {
    incidentId: created.incident.id,
    event: "incident_created",
    title: `Incident: ${created.title}`,
    message: `${created.title}. Severity: ${severity}. Ticket ${created.ticket.id} dibuat.`,
  });

  if (created.assignee) {
    await createLifecycleNotifications(input, {
      incidentId: created.incident.id,
      event: "ticket_assigned",
      title: `Ticket assigned: ${websiteName}`,
      message: `Ticket untuk incident ${created.incident.id} ditugaskan ke ${created.assignee.name}.`,
      preferUserId: created.assignee.id,
    });
  }
}

async function resolveIncidentFlow(
  input: PersistCheckInput,
  incidentId: string,
): Promise<void> {
  const { prisma, websiteId, websiteName } = input;

  const incident = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: IncidentStatus.resolved,
      resolvedAt: new Date(),
    },
  });

  await prisma.ticket.updateMany({
    where: {
      incidentId,
      status: { in: [TicketStatus.open, TicketStatus.in_progress] },
    },
    data: {
      status: TicketStatus.resolved,
      resolvedAt: new Date(),
    },
  });

  log(
    "incident_recovered",
    jobMeta(input.jobId, websiteId, input.scheduledAt.toISOString(), {
      incident_id: incident.id,
    }),
  );

  await createLifecycleNotifications(input, {
    incidentId: incident.id,
    event: "incident_recovered",
    title: `Recovered: ${websiteName}`,
    message: `Website ${websiteName} pulih (2 consecutive normal checks). Incident ${incident.id} resolved.`,
  });
}

async function createLifecycleNotifications(
  input: PersistCheckInput,
  opts: {
    incidentId: string;
    event: string;
    title: string;
    message: string;
    preferUserId?: string;
  },
): Promise<void> {
  const { prisma } = input;

  const roleFilter = {
    isActive: true as const,
    role: {
      in: [UserRole.it_ops, UserRole.helpdesk, UserRole.business_owner],
    },
  };

  const recipients = opts.preferUserId
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [{ id: opts.preferUserId }, roleFilter],
        },
        select: { id: true },
      })
    : await prisma.user.findMany({
        where: roleFilter,
        select: { id: true },
      });

  const uniqueIds = [...new Set(recipients.map((r) => r.id))];
  if (uniqueIds.length === 0) {
    // Still create group-targeted telegram without user
    const n = await prisma.notification.create({
      data: {
        userId: null,
        incidentId: opts.incidentId,
        channel: NotificationChannel.telegram,
        title: opts.title,
        message: opts.message,
        status: NotificationStatus.pending,
      },
    });
    await input.enqueueNotification(n.id);
    return;
  }

  for (const userId of uniqueIds) {
    const channels: NotificationChannel[] = [
      NotificationChannel.dashboard,
      NotificationChannel.email,
      NotificationChannel.telegram,
    ];

    for (const channel of channels) {
      const status =
        channel === NotificationChannel.dashboard
          ? NotificationStatus.sent
          : NotificationStatus.pending;
      const notification = await prisma.notification.create({
        data: {
          userId,
          incidentId: opts.incidentId,
          channel,
          title: opts.title,
          message: opts.message,
          status,
          sentAt: channel === NotificationChannel.dashboard ? new Date() : null,
        },
      });

      if (channel !== NotificationChannel.dashboard) {
        await input.enqueueNotification(notification.id);
      }
    }
  }

  log(
    "notifications_queued",
    jobMeta(input.jobId, input.websiteId, input.scheduledAt.toISOString(), {
      incident_id: opts.incidentId,
      event: opts.event,
      recipients: uniqueIds.length,
    }),
  );
}
