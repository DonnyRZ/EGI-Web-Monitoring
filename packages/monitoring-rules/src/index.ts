import type { MonitoringStatus, Severity } from "@egi/shared-types";

export interface CheckProbeResult {
  httpOk: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  browserOk: boolean;
  renderTimeMs: number | null;
  screenshotOk: boolean;
  errorMessage: string | null;
  /** True when the worker could not even start probes (bad URL, internal error). */
  probeAborted?: boolean;
  /** True when monitoring infrastructure, not the website, failed. */
  infrastructureFailure?: boolean;
}

/**
 * Derive per-check monitoring status from HTTP + browser probes.
 *
 * MVP thresholds (blueprint §5 + §8):
 * - normal: HTTP + browser succeed
 * - warning: partial success / slow / screenshot fail while site reachable
 * - unknown: probe aborted before checks ran
 * - down: both HTTP and browser failed (hard failure on this poll)
 *
 * Consecutive-failure → incident/down is handled separately by evaluateIncidentRules.
 */
export function deriveCheckStatus(probe: CheckProbeResult): MonitoringStatus {
  if (probe.probeAborted || probe.infrastructureFailure) {
    return "unknown";
  }

  const httpFail = !probe.httpOk;
  const browserFail = !probe.browserOk;

  if (httpFail && browserFail) {
    return "down";
  }

  if (httpFail || browserFail) {
    return "warning";
  }

  const slowHttp =
    probe.responseTimeMs != null && probe.responseTimeMs >= 5_000;
  const slowRender =
    probe.renderTimeMs != null && probe.renderTimeMs >= 10_000;

  if (slowHttp || slowRender || !probe.screenshotOk) {
    return "warning";
  }

  return "normal";
}

/** Only evidence of a website problem contributes to an incident. Unknown means
 * the monitoring pipeline itself was unable to measure the website. */
export function isFailureStatus(status: MonitoringStatus): boolean {
  return status === "down";
}

export function isSuccessStatus(status: MonitoringStatus): boolean {
  return status === "normal";
}

export type IncidentRuleAction =
  | { type: "none" }
  | {
      type: "create_incident";
      severity: Severity;
      titleHint: string;
      cardStatus: "down";
    }
  | {
      type: "keep_incident";
      cardStatus: "normal" | "warning" | "down" | "unknown";
    }
  | {
      type: "resolve_incident";
      cardStatus: "normal";
    };

export interface IncidentRuleInput {
  /** Newest-first recent statuses including the current check. */
  recentStatuses: MonitoringStatus[];
  hasActiveIncident: boolean;
}

/**
 * MVP incident rules (blueprint §8, §10, §12):
 * - 1 hard failure → warning card, no new incident
 * - 2 consecutive hard failures → create incident + down
 * - Performance warnings never create a critical outage incident
 * - 2 consecutive normals → resolve active incident (not close)
 * - Never create a second active incident (open/in_progress/resolved)
 */
export function evaluateIncidentRules(input: IncidentRuleInput): IncidentRuleAction {
  const recent = input.recentStatuses;
  const current = recent[0];
  if (!current) {
    return { type: "none" };
  }

  const consecutiveFailures = countLeading(recent, isFailureStatus);
  const consecutiveNormals = countLeading(recent, isSuccessStatus);

  if (input.hasActiveIncident) {
    if (current === "unknown") {
      return { type: "keep_incident", cardStatus: "unknown" };
    }
    if (consecutiveNormals >= 2) {
      return { type: "resolve_incident", cardStatus: "normal" };
    }
    if (consecutiveFailures >= 2) {
      return { type: "keep_incident", cardStatus: "down" };
    }
    if (current === "down" || current === "warning") {
      return { type: "keep_incident", cardStatus: "warning" };
    }
    // First normal while incident still open — show normal; resolve needs 2
    return { type: "keep_incident", cardStatus: "normal" };
  }

  if (consecutiveFailures >= 2) {
    return {
      type: "create_incident",
      severity: "critical",
      titleHint: "Website tidak dapat diakses",
      cardStatus: "down",
    };
  }

  return { type: "none" };
}

/**
 * Persist card status after rule evaluation.
 * First failure stays warning; second consecutive failure becomes down.
 */
export function applyCardStatusOverride(
  checkStatus: MonitoringStatus,
  action: IncidentRuleAction,
): MonitoringStatus {
  if (action.type === "create_incident" || action.type === "keep_incident") {
    return action.cardStatus;
  }
  if (action.type === "resolve_incident") {
    return "normal";
  }
  // First failure: force warning even if probe said down
  if (isFailureStatus(checkStatus)) {
    return "warning";
  }
  return checkStatus;
}

function countLeading(
  statuses: MonitoringStatus[],
  predicate: (s: MonitoringStatus) => boolean,
): number {
  let count = 0;
  for (const status of statuses) {
    if (!predicate(status)) break;
    count += 1;
  }
  return count;
}

/** Anti-spam: only these lifecycle events should create outbound notifications. */
export const NOTIFICATION_EVENTS = [
  "incident_created",
  "severity_changed",
  "ticket_assigned",
  "incident_recovered",
  "incident_closed",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export function shouldNotify(event: string): event is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(event);
}
