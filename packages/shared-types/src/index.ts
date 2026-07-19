/** Shared enums and job payload contracts used across API, scheduler, and worker. */

export type MonitoringStatus = "normal" | "warning" | "down" | "unknown";

export type Severity = "critical" | "high" | "medium" | "low";

export type IncidentStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type NotificationChannel = "dashboard" | "email" | "telegram";

export type NotificationStatus = "pending" | "sent" | "failed";

export type UserRole =
  | "end_user"
  | "business_owner"
  | "helpdesk"
  | "developer"
  | "it_ops";

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
