import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import type {
  MonitoringJobPayload,
  NotificationJobPayload,
  RetentionJobPayload,
} from "@egi/shared-types";

export type { MonitoringJobPayload, NotificationJobPayload, RetentionJobPayload };

export const QUEUE_NAMES = {
  monitoring: "monitoring-checks",
  notifications: "notification-dispatch",
  retention: "data-retention",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface RedisEnvConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

export function getRedisConnectionOptions(
  env: NodeJS.ProcessEnv = process.env,
): ConnectionOptions {
  const password = env.REDIS_PASSWORD?.trim();
  return {
    host: env.REDIS_HOST || "localhost",
    port: Number(env.REDIS_PORT || 6379),
    password: password ? password : undefined,
    db: env.REDIS_DB ? Number(env.REDIS_DB) : 0,
    maxRetriesPerRequest: null,
  };
}

export function createRedisConnection(
  env: NodeJS.ProcessEnv = process.env,
): IORedis {
  const opts = getRedisConnectionOptions(env) as {
    host: string;
    port: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest: null;
  };
  return new IORedis(opts);
}

/** Unique BullMQ job id for a monitoring slot (prevents duplicate enqueues).
 * BullMQ forbids `:` in custom job ids.
 */
export function monitoringJobId(websiteId: string, scheduledAt: Date | string): string {
  const iso = typeof scheduledAt === "string" ? scheduledAt : scheduledAt.toISOString();
  const slot = iso.replace(/[:.]/g, "-");
  return `mon_${websiteId}_${slot}`;
}

export function createMonitoringQueue(
  connection: ConnectionOptions = getRedisConnectionOptions(),
): Queue<MonitoringJobPayload> {
  return new Queue<MonitoringJobPayload>(QUEUE_NAMES.monitoring, { connection });
}

export function createNotificationQueue(
  connection: ConnectionOptions = getRedisConnectionOptions(),
): Queue<NotificationJobPayload> {
  return new Queue<NotificationJobPayload>(QUEUE_NAMES.notifications, { connection });
}

export function createRetentionQueue(
  connection: ConnectionOptions = getRedisConnectionOptions(),
): Queue<RetentionJobPayload> {
  return new Queue<RetentionJobPayload>(QUEUE_NAMES.retention, { connection });
}

export const DEFAULT_MONITORING_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "custom",
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/**
 * BullMQ custom backoff: attempt 1→2 wait 10s, attempt 2→3 wait 30s.
 * `attemptsMade` is attempts already completed when computing delay for next.
 */
export function monitoringBackoffStrategy(attemptsMade: number): number {
  if (attemptsMade <= 1) return 10_000;
  if (attemptsMade === 2) return 30_000;
  return 30_000;
}

export async function enqueueMonitoringJob(
  queue: Queue<MonitoringJobPayload>,
  payload: MonitoringJobPayload,
  options?: JobsOptions,
): Promise<{ jobId: string; enqueued: boolean }> {
  const jobId = monitoringJobId(payload.website_id, payload.scheduled_at);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "failed" && state !== "completed") {
      return { jobId, enqueued: false };
    }
    // Allow re-enqueue after terminal states by removing stale job id
    await existing.remove().catch(() => undefined);
  }

  try {
    await queue.add("check", payload, {
      ...DEFAULT_MONITORING_JOB_OPTIONS,
      jobId,
      ...options,
    });
    return { jobId, enqueued: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|JobId/i.test(message)) {
      return { jobId, enqueued: false };
    }
    throw error;
  }
}

export async function enqueueNotificationJob(
  queue: Queue<NotificationJobPayload>,
  notificationId: string,
): Promise<void> {
  await queue.add(
    "dispatch",
    { notification_id: notificationId },
    {
      jobId: `notif_${notificationId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 2000 },
      removeOnFail: { count: 2000 },
    },
  );
}

export async function logQueueMetrics(
  queue: Queue,
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);
  log("queue_metrics", {
    queue: queue.name,
    waiting,
    active,
    delayed,
    failed,
    completed,
  });
}
