export type {
  MonitoringStatus,
  Severity,
  IncidentStatus,
  TicketStatus,
  TicketCategory,
  NotificationChannel,
  NotificationStatus,
  TaskStatus,
  TaskBusinessStatus,
  TaskMonitoringPeriod,
  TaskMonitoringOverviewResponse,
  ProjectStatus,
  ProjectMemberType,
  UserStoryStatus,
  UserStoryPriority,
  UserRole,
} from "@egi/shared-types";

import type {
  IncidentStatus,
  MonitoringStatus,
  NotificationChannel,
  NotificationStatus,
  Severity,
  TaskStatus,
  TaskBusinessStatus,
  ProjectStatus,
  ProjectMemberType,
  UserStoryStatus,
  UserStoryPriority,
  TicketStatus,
  TicketCategory,
  UserRole,
} from "@egi/shared-types";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  telegram_chat_id: string | null;
  email_verified_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Website {
  id: string;
  name: string;
  domain: string;
  url: string;
  project_id?: string | null;
  owner_id: string | null;
  it_pic_id: string | null;
  backup_it_pic_id: string | null;
  monitoring_interval_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MonitoringResult {
  id: string;
  website_id: string;
  scheduled_at: string;
  checked_at: string;
  status: MonitoringStatus;
  http_status: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  created_at: string;
}

/** Fields intentionally available to the public website gallery only. */
export type PublicWebsite = Pick<Website, "id" | "name" | "domain" | "url" | "is_active">;

/** Public health snapshot; operational response details stay private. */
export interface PublicMonitoringSnapshot {
  status: MonitoringStatus;
  checked_at: string;
}

export interface Incident {
  id: string;
  website_id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  started_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  incident_id: string | null;
  website_id: string | null;
  project_id: string | null;
  user_story_id: string | null;
  user_story_ids: string[];
  user_story_count: number;
  created_by: string | null;
  title: string;
  category: TicketCategory | null;
  description: string | null;
  expectation: string | null;
  attachment_url: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  priority: Severity;
  status: TicketStatus;
  sla_deadline: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface Task {
  id: string;
  website_id: string;
  assignee_id: string;
  assignee_name: string | null;
  created_by_id: string | null;
  ticket_id: string | null;
  instruction_notes: string;
  attachment_url: string | null;
  status: TaskStatus;
  sla_deadline: string | null;
  problem: string | null;
  expectation: string | null;
  ticket_attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskMonitoringStory {
  id: string;
  title: string;
  status: UserStoryStatus;
  priority: UserStoryPriority;
  due_date: string | null;
  primary_developer: UserSummary | null;
  collaborators: UserSummary[];
}

export interface TaskMonitoringRow {
  id: string;
  source: "task" | "legacy_task";
  source_id: string;
  title: string;
  summary: string | null;
  project: { id: string; name: string } | null;
  website: { id: string; name: string; domain: string } | null;
  status: TaskBusinessStatus;
  status_reason: "automatic" | "manual_override" | "waiting_pic_developer" | "legacy_task";
  priority: Severity;
  pic_developer: UserSummary | null;
  developers: UserSummary[];
  due_date: string | null;
  last_update: string;
  is_overdue: boolean;
  needs_action: boolean;
  story_count: number;
  stories: TaskMonitoringStory[];
  business: {
    problem: string | null;
    expectation: string | null;
    attachment_url: string | null;
    category: string | null;
  } | null;
}

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

export interface TaskMonitoringFilters {
  projects: Array<{ id: string; name: string }>;
  websites: Array<{ id: string; name: string; domain: string; project_id: string | null }>;
  developers: Array<{ id: string; name: string; email: string; project_ids: string[] }>;
}

export interface UserSummary {
  id: string;
  name: string;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface ProjectMember {
  id: string;
  user_id: string;
  member_type: ProjectMemberType;
  user: UserSummary;
  active_workload?: number;
  overdue_workload?: number;
}

export interface ProjectHealthSummary {
  status: MonitoringStatus;
  normal: number;
  warning: number;
  down: number;
  unknown: number;
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
  pic_developer: UserSummary | null;
  pic_web: UserSummary[];
  developers: UserSummary[];
}

export interface Project extends ProjectListSummary {
  websites: Website[];
  health_summary: ProjectHealthSummary;
  active_incidents_count: number;
  untriaged_tickets_count: number;
}

export interface ProjectAssignments {
  pic_web_ids: string[];
  pic_developer_id: string | null;
  developer_ids: string[];
}

export interface ProjectRosterCandidate extends UserSummary {
  role: UserRole;
  is_active: boolean;
  active_workload: number;
  overdue_workload: number;
}

export interface UserStory {
  id: string;
  project_id: string;
  website_id: string | null;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  priority: UserStoryPriority;
  status: UserStoryStatus;
  primary_developer_id: string | null;
  due_date: string | null;
  created_by_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  project?: Pick<Project, "id" | "name">;
  website?: Pick<Website, "id" | "name" | "domain"> | null;
  primary_developer: UserSummary | null;
  collaborators: UserSummary[];
  tickets: Pick<Ticket, "id" | "title" | "status">[];
  is_overdue: boolean;
}

export interface WorkSummary {
  pending: number;
  in_progress: number;
  overdue: number;
  done: number;
}

export interface MyWorkResponse {
  stories: UserStory[];
  legacy_tasks: Task[];
  summary: WorkSummary;
}

export interface Notification {
  id: string;
  user_id: string | null;
  incident_id: string | null;
  channel: NotificationChannel;
  title: string;
  message: string;
  status: NotificationStatus;
  sent_at: string | null;
  read_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface DashboardWebsiteCard {
  website: Website | PublicWebsite;
  latest_result: MonitoringResult | PublicMonitoringSnapshot | null;
  active_incident: Incident | null;
}

export interface WebsiteDetailResponse {
  website: Website;
  latest_result: MonitoringResult | null;
  monitoring_history: MonitoringResult[];
  active_incident: Incident | null;
  incident_history: Incident[];
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: User;
}

export interface DeveloperWorkload {
  developer_id: string;
  developer_name: string;
  pending: number;
  pending_orphan_tickets: number;
  in_progress: number;
  in_progress_orphan_tickets: number;
  overdue: number;
  overdue_orphan_tickets: number;
  total_active: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
