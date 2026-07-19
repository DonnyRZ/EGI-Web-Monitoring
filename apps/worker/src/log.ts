export function log(
  message: string,
  meta?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      message,
      ...meta,
    }),
  );
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
