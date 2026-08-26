import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../.env") });
config();

import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@egi/database";
import {
  QUEUE_NAMES,
  assertRedisProductionConfig,
  createNotificationQueue,
  createRedisConnection,
  enqueueNotificationJob,
  getRedisConnectionOptions,
  logQueueMetrics,
  monitoringBackoffStrategy,
  type MonitoringJobPayload,
  type NotificationJobPayload,
  type RetentionJobPayload,
} from "@egi/queue";
import { DelayedError, Job, Queue, Worker } from "bullmq";
import { jobMeta, log } from "./log";
import {
  dispatchNotification,
  markNotificationFailed,
} from "./notifications/dispatch";
import { reconcilePendingNotifications } from "./notifications/reconcile";
import { runProbes } from "./probes";
import { persistCheckAndEvaluate } from "./rules-apply";
import { runRetentionCleanup } from "./retention";
import { acquireWebsiteLock, releaseWebsiteLock } from "./website-lock";

assertRedisProductionConfig();
const prisma = createPrismaClient();
const connection = getRedisConnectionOptions();
const redis = createRedisConnection();
const notificationQueue = createNotificationQueue(connection);
const monitoringQueue = new Queue(QUEUE_NAMES.monitoring, { connection });
const retentionQueue = new Queue<RetentionJobPayload>(QUEUE_NAMES.retention, {
  connection,
});

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 5));
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 15_000);
const LATE_JOB_SKIP_MS = Number(process.env.LATE_JOB_SKIP_MS || 4 * 60_000);
const RETENTION_CRON = process.env.RETENTION_CRON || "0 2 * * *";

async function processMonitoringJob(
  job: Job<MonitoringJobPayload>,
): Promise<void> {
  const payload = job.data;
  const websiteId = payload.website_id;
  const scheduledAt = new Date(payload.scheduled_at);
  const meta = (extra?: Record<string, unknown>) =>
    jobMeta(job.id, websiteId, payload.scheduled_at, {
      attempt: job.attemptsMade + 1,
      ...extra,
    });

  log("job_started", meta());

  // Late jobs (>4 min) may skip to avoid backlog pile-up
  const ageMs = Date.now() - scheduledAt.getTime();
  if (ageMs > LATE_JOB_SKIP_MS) {
    log("job_skipped_late", meta({ age_ms: ageMs, late_threshold_ms: LATE_JOB_SKIP_MS }));
    return;
  }

  // Idempotent: skip if result already exists
  const existing = await prisma.monitoringResult.findUnique({
    where: {
      websiteId_scheduledAt: { websiteId, scheduledAt },
    },
  });
  if (existing) {
    log("job_skipped_idempotent", meta({ result_id: existing.id }));
    return;
  }

  const lockToken = randomUUID();
  const locked = await acquireWebsiteLock(redis, websiteId, lockToken);
  if (!locked) {
    // Re-delay so another website can proceed; max one active job per website
    log("job_delayed_website_busy", meta());
    await job.moveToDelayed(Date.now() + 5_000, job.token);
    throw new DelayedError();
  }

  try {
    const website = await prisma.website.findUnique({ where: { id: websiteId } });
    if (!website || !website.isActive) {
      log("job_skipped_inactive", meta());
      return;
    }

    const probe = await runProbes({
      url: payload.url || website.url,
      httpTimeoutMs: HTTP_TIMEOUT_MS,
    });

    log(
      "http_check_completed",
      meta({
        http_ok: probe.httpOk,
        http_status: probe.httpStatus,
        response_time_ms: probe.responseTimeMs,
      }),
    );

    await persistCheckAndEvaluate({
      prisma,
      jobId: job.id,
      websiteId,
      websiteName: website.name,
      scheduledAt,
      probe,
      enqueueNotification: async (notificationId) => {
        try {
          await enqueueNotificationJob(notificationQueue, notificationId);
        } catch (error) {
          log("notification_enqueue_failed", {
            notification_id: notificationId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });

    log("job_completed", meta());
  } finally {
    await releaseWebsiteLock(redis, websiteId, lockToken);
  }
}

async function processNotificationJob(
  job: Job<NotificationJobPayload>,
): Promise<void> {
  const { notification_id } = job.data;
  try {
    await dispatchNotification(prisma, notification_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade + 1 >= maxAttempts) {
      await markNotificationFailed(prisma, notification_id, message);
      log("notification_failed_final", {
        notification_id,
        error: message,
        attempts: job.attemptsMade + 1,
      });
      return;
    }
    throw error;
  }
}

async function ensureRetentionSchedule(): Promise<void> {
  await retentionQueue.add(
    "daily-cleanup",
    { triggered_at: new Date().toISOString() },
    {
      repeat: { pattern: RETENTION_CRON },
      jobId: "retention-daily",
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  );
}

async function reconcileNotifications(): Promise<void> {
  try {
    const recovered = await reconcilePendingNotifications(
      prisma,
      (notificationId) => enqueueNotificationJob(notificationQueue, notificationId),
    );
    if (recovered > 0) {
      log("notification_pending_reconciled", { count: recovered });
    }
  } catch (error) {
    log("notification_reconcile_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  log("worker_started", {
    concurrency: CONCURRENCY,
    http_timeout_ms: HTTP_TIMEOUT_MS,
    late_job_skip_ms: LATE_JOB_SKIP_MS,
  });

  await ensureRetentionSchedule();
  await reconcileNotifications();

  const monitoringWorker = new Worker<MonitoringJobPayload>(
    QUEUE_NAMES.monitoring,
    async (job) => processMonitoringJob(job),
    {
      connection,
      concurrency: CONCURRENCY,
      settings: {
        backoffStrategy: monitoringBackoffStrategy,
      },
    },
  );

  const notificationWorker = new Worker<NotificationJobPayload>(
    QUEUE_NAMES.notifications,
    async (job) => processNotificationJob(job),
    {
      connection,
      concurrency: 2,
    },
  );

  const retentionWorker = new Worker<RetentionJobPayload>(
    QUEUE_NAMES.retention,
    async () => {
      await runRetentionCleanup(prisma);
    },
    { connection, concurrency: 1 },
  );

  monitoringWorker.on("failed", (job, err) => {
    log("job_failed", {
      job_id: job?.id,
      website_id: job?.data.website_id,
      scheduled_at: job?.data.scheduled_at,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  const metricsTimer = setInterval(() => {
    void logQueueMetrics(monitoringQueue, log);
    void logQueueMetrics(notificationQueue, log);
    void reconcileNotifications();
  }, 60_000);

  const shutdown = async (signal: string) => {
    log("worker_shutdown", { signal });
    clearInterval(metricsTimer);
    await Promise.all([
      monitoringWorker.close(),
      notificationWorker.close(),
      retentionWorker.close(),
    ]);
    await notificationQueue.close();
    await monitoringQueue.close();
    await retentionQueue.close();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  log("worker_fatal_error", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  await prisma.$disconnect();
  process.exit(1);
});
