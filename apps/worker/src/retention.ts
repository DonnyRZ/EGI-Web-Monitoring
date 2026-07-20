import { PrismaClient } from "@egi/database";
import {
  createS3Client,
  deleteScreenshotsOlderThan,
  getBucket,
} from "./storage/s3";
import { log } from "./log";

export async function runRetentionCleanup(prisma: PrismaClient): Promise<void> {
  const resultsDays = readRetentionDays("RETENTION_MONITORING_RESULTS_DAYS", 90);
  const screenshotsDays = readRetentionDays("RETENTION_SCREENSHOTS_DAYS", 30);
  const notificationsDays = readRetentionDays("RETENTION_NOTIFICATIONS_DAYS", 90);

  const resultsCutoff = daysAgo(resultsDays);
  const screenshotsCutoff = daysAgo(screenshotsDays);
  const notificationsCutoff = daysAgo(notificationsDays);

  const deletedResults = await prisma.monitoringResult.deleteMany({
    where: { createdAt: { lt: resultsCutoff } },
  });

  const deletedNotifications = await prisma.notification.deleteMany({
    where: { createdAt: { lt: notificationsCutoff } },
  });

  let deletedScreenshots = 0;
  try {
    const client = createS3Client();
    deletedScreenshots = await deleteScreenshotsOlderThan(
      client,
      getBucket(),
      screenshotsCutoff,
    );
  } catch (error) {
    log("retention_screenshot_cleanup_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  log("retention_cleanup_done", {
    monitoring_results_deleted: deletedResults.count,
    notifications_deleted: deletedNotifications.count,
    screenshots_deleted: deletedScreenshots,
    results_cutoff: resultsCutoff.toISOString(),
    screenshots_cutoff: screenshotsCutoff.toISOString(),
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
