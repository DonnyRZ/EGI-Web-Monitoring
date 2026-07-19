import { config } from "dotenv";
import { resolve } from "node:path";

// Load monorepo root .env whether started from root or apps/scheduler
config({ path: resolve(__dirname, "../../../.env") });
config(); // fallback cwd .env

import { createPrismaClient } from "@egi/database";
import {
  createMonitoringQueue,
  enqueueMonitoringJob,
  getRedisConnectionOptions,
  logQueueMetrics,
} from "@egi/queue";

const prisma = createPrismaClient();
const queue = createMonitoringQueue(getRedisConnectionOptions());

const INTERVAL_MINUTES = Math.max(
  1,
  Number(process.env.MONITORING_INTERVAL_MINUTES || 5),
);

function floorToSlot(date: Date, intervalMinutes: number): Date {
  const ms = intervalMinutes * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

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
    // MVP: enqueue every active site on the global slot.
    // Per-site interval can gate later; avoid skipping the whole fleet when
    // MONITORING_INTERVAL_MINUTES is shortened for smoke tests.
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
    skipped_duplicate: skipped,
  });

  await logQueueMetrics(queue, log);
}

let lastSlotIso: string | null = null;
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const slot = floorToSlot(new Date(), INTERVAL_MINUTES);
    const slotIso = slot.toISOString();
    if (slotIso === lastSlotIso) {
      return;
    }
    lastSlotIso = slotIso;
    await enqueueSlot(slot);
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
    interval_minutes: INTERVAL_MINUTES,
    redis_host: process.env.REDIS_HOST || "localhost",
    redis_port: Number(process.env.REDIS_PORT || 6379),
  });

  // Enqueue current slot immediately on boot
  await tick();

  const timer = setInterval(() => {
    void tick();
  }, 15_000);

  const shutdown = async (signal: string) => {
    log("scheduler_shutdown", { signal });
    clearInterval(timer);
    await queue.close();
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
