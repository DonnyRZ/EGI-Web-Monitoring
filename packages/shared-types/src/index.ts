/** Shared enums and job payload contracts used across API, scheduler, and worker. */

export type MonitoringStatus = "normal" | "warning" | "down" | "unknown";

export type Severity = "critical" | "high" | "medium" | "low";

export type IncidentStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketCategory = "website" | "help_desk" | "procurement";

export type NotificationChannel = "dashboard" | "email" | "telegram";

export type NotificationStatus = "pending" | "sent" | "failed";

export type TaskStatus = "pending" | "in_progress" | "done";

/** Business-facing status for the unified Task Monitoring workspace. */
export type TaskBusinessStatus = "new" | "in_progress" | "waiting_pic" | "blocked" | "done";

export type ProjectStatus = "draft" | "active" | "archived";

export type ProjectMemberType = "pic_web" | "developer";

export type UserStoryStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

export type UserStoryPriority = "critical" | "high" | "medium" | "low";

export interface TaskMonitoringSummary {
  total: number;
  needs_action: number;
  new: number;
  in_progress: number;
  waiting_pic: number;
  blocked: number;
  overdue: number;
  done: number;
}

export interface ProjectListSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  pic_developer_id: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  websites_count: number;
  active_websites_count: number;
  active_tickets_count: number;
  active_stories_count: number;
  overdue_count: number;
  health: MonitoringStatus;
  configuration_status: "ready" | "needs_setup";
}

export type { UserRole } from "./rbac";
export {
  USER_ROLES,
  PLATFORM_ADMIN_ROLES,
  PROJECT_ADMIN_ROLES,
  PROJECT_GLOBAL_VIEWER_ROLES,
  USER_STORY_MANAGER_ROLES,
  ALL_RESOURCE_ACCESS_ROLES,
  INCIDENT_MANAGER_ROLES,
  TICKET_MANAGER_ROLES,
  TICKET_ASSIGNEE_ROLES,
  TASK_INTAKE_CREATOR_ROLES,
  LIFECYCLE_NOTIFICATION_ROLES,
  WORKLOAD_VIEWER_ROLES,
  canManagePlatform,
  canManageProjects,
  canViewProjectRegistry,
  canManageUserStories,
  canAccessAllMonitoredResources,
  canInspectMonitoringDetails,
  canViewIncidents,
  canViewTasks,
  canViewUserStories,
  canManageIncidents,
  canManageTickets,
  isTicketAssigneeCandidate,
  canCreateTaskIntake,
  canViewTaskMonitoring,
  receivesLifecycleNotifications,
  isEndUserPublicDashboard,
  opensWebsiteExternallyFromDashboard,
  canViewDashboardScreenshots,
  canViewDeveloperWorkload,
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
