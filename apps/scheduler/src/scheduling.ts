export function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

/**
 * A website is due only on its own stable UTC slot. Epoch-based slots avoid
 * each scheduler instance choosing a different arbitrary start time.
 */
export function isWebsiteDue(
  scheduledAt: Date,
  monitoringIntervalMinutes: number,
): boolean {
  const interval = Math.max(1, Math.floor(monitoringIntervalMinutes));
  return scheduledAt.getTime() % (interval * 60_000) === 0;
}
