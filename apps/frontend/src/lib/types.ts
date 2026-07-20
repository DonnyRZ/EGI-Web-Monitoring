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
  owner_id: string | null;
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
  render_time_ms: number | null;
  screenshot_url: string | null;
  error_message: string | null;
  created_at: string;
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
  incident_id: string;
  title: string;
  assigned_to: string | null;
  priority: Severity;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
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
  website: Website;
  latest_result: MonitoringResult | null;
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

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
