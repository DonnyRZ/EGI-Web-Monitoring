/**
 * Central RBAC policy.
 *
 * Roles: superadmin | bos_it | developer | pic_web | end_user
 * Rewrite capability sets here — apps should not hardcode role string compares.
 */

export type UserRole = "superadmin" | "bos_it" | "developer" | "pic_web" | "end_user";

/** Stable order for admin UI / API docs. */
export const USER_ROLES = [
  "end_user",
  "pic_web",
  "developer",
  "bos_it",
  "superadmin",
] as const satisfies readonly UserRole[];

/** Platform config: users + websites CRUD. */
export const PLATFORM_ADMIN_ROLES = ["superadmin"] as const satisfies readonly UserRole[];

/**
 * Read/inspect every monitored website, incident, ticket, and probe detail globally.
 * end_user gets a public gallery of active sites (excludes down / unknown / inactive).
 */
export const ALL_RESOURCE_ACCESS_ROLES = [
  "superadmin",
  "bos_it",
  "developer",
] as const satisfies readonly UserRole[];

/** Mutate / close incidents. */
export const INCIDENT_MANAGER_ROLES = ["superadmin"] as const satisfies readonly UserRole[];

/** Create / update tickets. */
export const TICKET_MANAGER_ROLES = [
  "superadmin",
  "bos_it",
  "developer",
  "pic_web",
] as const satisfies readonly UserRole[];

/** Auto-assignee candidates when an incident opens. */
export const TICKET_ASSIGNEE_ROLES = [
  "bos_it",
  "developer",
] as const satisfies readonly UserRole[];

/**
 * View the developer workload/overdue summary (read-only).
 * PIC Web is included but scoped server-side to developers of their own websites.
 */
export const WORKLOAD_VIEWER_ROLES = [
  "superadmin",
  "bos_it",
  "pic_web",
] as const satisfies readonly UserRole[];

/**
 * Roles that always receive incident lifecycle notifications.
 * Website owners are still included separately per website in the worker.
 */
export const LIFECYCLE_NOTIFICATION_ROLES = [
  "superadmin",
  "bos_it",
  "developer",
] as const satisfies readonly UserRole[];

function roleIn(
  role: string | null | undefined,
  allowed: readonly UserRole[],
): boolean {
  if (!role) return false;
  return (allowed as readonly string[]).includes(role);
}

export function canManagePlatform(role?: string | null): boolean {
  return roleIn(role, PLATFORM_ADMIN_ROLES);
}

export function canAccessAllMonitoredResources(role?: string | null): boolean {
  return roleIn(role, ALL_RESOURCE_ACCESS_ROLES);
}

/** Probe history / website monitoring detail pages. */
export function canInspectMonitoringDetails(role?: string | null): boolean {
  return canAccessAllMonitoredResources(role);
}

/**
 * Incidents nav + incident list. PIC Web is included but only sees incidents
 * on websites they own (enforced in IncidentsService).
 */
export function canViewIncidents(role?: string | null): boolean {
  return canAccessAllMonitoredResources(role) || role === "pic_web";
}

/**
 * Task list / Task Monitoring. PIC Web is included but only sees tasks
 * on websites they own (enforced in TasksService).
 */
export function canViewTasks(role?: string | null): boolean {
  return canAccessAllMonitoredResources(role) || role === "pic_web";
}

export function canManageIncidents(role?: string | null): boolean {
  return roleIn(role, INCIDENT_MANAGER_ROLES);
}

export function canManageTickets(role?: string | null): boolean {
  return roleIn(role, TICKET_MANAGER_ROLES);
}

export function isTicketAssigneeCandidate(role?: string | null): boolean {
  return roleIn(role, TICKET_ASSIGNEE_ROLES);
}

/** Developer workload summary page (who's overloaded / overdue). */
export function canViewDeveloperWorkload(role?: string | null): boolean {
  return roleIn(role, WORKLOAD_VIEWER_ROLES);
}

export function receivesLifecycleNotifications(role?: string | null): boolean {
  return roleIn(role, LIFECYCLE_NOTIFICATION_ROLES);
}

/** end_user dashboard: active sites except down and unknown. */
export function isEndUserPublicDashboard(role?: string | null): boolean {
  return role === "end_user";
}

/** Dashboard card opens the live site instead of monitoring detail. */
export function opensWebsiteExternallyFromDashboard(role?: string | null): boolean {
  return isEndUserPublicDashboard(role);
}

/** Dashboard card screenshots are visible to every authenticated role. */
export function canViewDashboardScreenshots(role?: string | null): boolean {
  return Boolean(role);
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "superadmin":
      return "Superadmin";
    case "developer":
      return "Developer";
    case "bos_it":
      return "Bos IT";
    case "pic_web":
      return "PIC Web";
    case "end_user":
      return "End User";
  }
}
