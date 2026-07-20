import { config } from "dotenv";
import { resolve } from "node:path";

// Load monorepo root .env whether started from root or apps/scheduler
config({ path: resolve(__dirname, "../../../.env") });
config(); // fallback cwd .env

import { createPrismaClient } from "@egi/database";
import {
  createMonitoringQueue,
  createRedisConnection,
  assertRedisProductionConfig,
  enqueueMonitoringJob,
  getRedisConnectionOptions,
  logQueueMetrics,
} from "@egi/queue";
import { floorToMinute, isWebsiteDue } from "./scheduling";
import { acquireSchedulerLock, releaseSchedulerLock } from "./scheduler-lock";

assertRedisProductionConfig();
const prisma = createPrismaClient();
const queue = createMonitoringQueue(getRedisConnectionOptions());
const redis = createRedisConnection();
const TICK_SECONDS = Math.max(5, Number(process.env.SCHEDULER_TICK_SECONDS || 15));

function log(message: string, meta?: Record<string, unknown>) {
  const line = meta
    ? JSON.stringify({ ts: new Date().toISOString(), message, ...meta })
    : JSON.stringify({ ts: new Date().toISOString(), message });
  console.log(line);
}

async function enqueueSlot(scheduledAt: Date): Promise<void> {
  const websites = await prisma.website.findMany({
    where: { isActive: true },
    select: { id: true, url: true, monitoringIntervalMinutes: true },
  });

  let enqueued = 0;
  let skipped = 0;

  for (const site of websites) {
    if (!isWebsiteDue(scheduledAt, site.monitoringIntervalMinutes)) {
      skipped += 1;
      continue;
    }

    const result = await enqueueMonitoringJob(queue, {
      website_id: site.id,
      url: site.url,
      scheduled_at: scheduledAt.toISOString(),
      attempt: 1,
    });

    if (result.enqueued) {
      enqueued += 1;
      log("job_created", {
        job_id: result.jobId,
        website_id: site.id,
        scheduled_at: scheduledAt.toISOString(),
      });
    } else {
      skipped += 1;
    }
  }

  log("scheduler_tick", {
    scheduled_at: scheduledAt.toISOString(),
    websites: websites.length,
    enqueued,
    skipped_not_due_or_duplicate: skipped,
  });

  await logQueueMetrics(queue, log);
}

let lastSlotIso: string | null = null;
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const slot = floorToMinute(new Date());
    const slotIso = slot.toISOString();
    if (slotIso === lastSlotIso) {
      return;
    }
    const lockToken = await acquireSchedulerLock(redis);
    if (!lockToken) {
      log("scheduler_tick_skipped_lock_held", { scheduled_at: slotIso });
      return;
    }

    try {
      // Store only after leadership is acquired: another instance may have
      // processed the prior tick while this instance was waiting for Redis.
      lastSlotIso = slotIso;
      await enqueueSlot(slot);
    } finally {
      await releaseSchedulerLock(redis, lockToken);
    }
  } catch (error) {
    log("scheduler_error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    ticking = false;
  }
}

async function main() {
  log("scheduler_started", {
    tick_seconds: TICK_SECONDS,
    redis_host: process.env.REDIS_HOST || "localhost",
    redis_port: Number(process.env.REDIS_PORT || 6379),
  });

  // Enqueue current slot immediately on boot
  await tick();

  const timer = setInterval(() => {
    void tick();
  }, TICK_SECONDS * 1_000);

  const shutdown = async (signal: string) => {
    log("scheduler_shutdown", { signal });
    clearInterval(timer);
    await queue.close();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  console.error(error);
  await queue.close();
  await prisma.$disconnect();
  process.exit(1);
});
