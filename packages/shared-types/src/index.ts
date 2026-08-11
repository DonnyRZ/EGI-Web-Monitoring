/** Shared enums and job payload contracts used across API, scheduler, and worker. */

export type MonitoringStatus = "normal" | "warning" | "down" | "unknown";

export type Severity = "critical" | "high" | "medium" | "low";

export type IncidentStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type NotificationChannel = "dashboard" | "email" | "telegram";

export type NotificationStatus = "pending" | "sent" | "failed";

export type TaskStatus = "pending" | "in_progress" | "done";

export type { UserRole } from "./rbac";
export {
  USER_ROLES,
  PLATFORM_ADMIN_ROLES,
  ALL_RESOURCE_ACCESS_ROLES,
  INCIDENT_MANAGER_ROLES,
  TICKET_MANAGER_ROLES,
  TICKET_ASSIGNEE_ROLES,
  LIFECYCLE_NOTIFICATION_ROLES,
  canManagePlatform,
  canAccessAllMonitoredResources,
  canInspectMonitoringDetails,
  canViewIncidents,
  canViewTasks,
  canManageIncidents,
  canManageTickets,
  isTicketAssigneeCandidate,
  receivesLifecycleNotifications,
  isEndUserPublicDashboard,
  opensWebsiteExternallyFromDashboard,
  canViewDashboardScreenshots,
  roleLabel,
} from "./rbac";

/** BullMQ monitoring check job payload (scheduler → worker). */
export interface MonitoringJobPayload {
  website_id: string;
  url: string;
  /** ISO-8601 scheduled slot (unique with website_id). */
  scheduled_at: string;
  attempt: number;
}

export type NotificationEventType =
  | "incident_created"
  | "severity_changed"
  | "ticket_assigned"
  | "incident_recovered"
  | "incident_closed";

export interface NotificationJobPayload {
  notification_id: string;
}

export interface RetentionJobPayload {
  triggered_at: string;
}
