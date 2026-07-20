import { createLogger, type LogMeta } from "@egi/logging";

const logger = createLogger("worker");

export function log(
  message: string,
  meta?: LogMeta,
): void {
  logger.log(message, undefined, meta);
}

export function jobMeta(
  jobId: string | undefined,
  websiteId: string,
  scheduledAt: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    job_id: jobId ?? null,
    website_id: websiteId,
    scheduled_at: scheduledAt,
    ...extra,
  };
}
