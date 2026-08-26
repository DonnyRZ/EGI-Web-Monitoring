import { PrismaClient } from "@egi/database";
import { log } from "./log";

export async function runRetentionCleanup(prisma: PrismaClient): Promise<void> {
  const resultsDays = readRetentionDays("RETENTION_MONITORING_RESULTS_DAYS", 90);
  const notificationsDays = readRetentionDays("RETENTION_NOTIFICATIONS_DAYS", 90);

  const resultsCutoff = daysAgo(resultsDays);
  const notificationsCutoff = daysAgo(notificationsDays);

  const deletedResults = await prisma.monitoringResult.deleteMany({
    where: { createdAt: { lt: resultsCutoff } },
  });

  const deletedNotifications = await prisma.notification.deleteMany({
    where: { createdAt: { lt: notificationsCutoff } },
  });

  log("retention_cleanup_done", {
    monitoring_results_deleted: deletedResults.count,
    notifications_deleted: deletedNotifications.count,
    results_cutoff: resultsCutoff.toISOString(),
    notifications_cutoff: notificationsCutoff.toISOString(),
  });
}

export function readRetentionDays(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive whole number of days`);
  }
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
    throw new Error(`${name} must be between 1 and 3650 days`);
  }
  return days;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
