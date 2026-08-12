import { apiFetch } from "./api";
import type {
  DashboardWebsiteCard,
  DeveloperWorkload,
  Incident,
  IncidentStatus,
  LoginResponse,
  MonitoringResult,
  Notification,
  PaginatedMeta,
  Severity,
  Task,
  Ticket,
  User,
  UserRole,
  Website,
  WebsiteDetailResponse,
} from "./types";

function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  me: () => apiFetch<User>("/auth/me"),
  refresh: () => apiFetch<LoginResponse>("/auth/refresh", { method: "POST", body: {}, auth: false, skipRefresh: true }),
  logout: () =>
    apiFetch<void>("/auth/logout", {
      method: "POST",
      body: {},
    }),
  forgotPassword: (email: string) =>
    apiFetch<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
      auth: false,
    }),
  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { token, new_password: newPassword },
      auth: false,
    }),
};

export const dashboardApi = {
  list: () => apiFetch<{ data: DashboardWebsiteCard[] }>("/dashboard"),
  website: (id: string, history_limit = 48) =>
    apiFetch<WebsiteDetailResponse>(
      `/dashboard/websites/${id}${qs({ history_limit })}`,
    ),
};

export const monitoringApi = {
  screenshot: (id: string) =>
    apiFetch<{ url: string; expires_at: string }>(
      `/monitoring-results/${id}/screenshot`,
    ),
  get: (id: string) => apiFetch<MonitoringResult>(`/monitoring-results/${id}`),
};

export const incidentsApi = {
  list: (params: {
    page?: number;
    limit?: number;
    website_id?: string;
    status?: IncidentStatus;
    severity?: Severity;
    active_only?: boolean;
  } = {}) =>
    apiFetch<{ data: Incident[]; meta: PaginatedMeta }>(
      `/incidents${qs(params)}`,
    ),
  get: (id: string) => apiFetch<Incident>(`/incidents/${id}`),
  update: (
    id: string,
    body: Partial<{ title: string; severity: Severity; status: IncidentStatus }>,
  ) => apiFetch<Incident>(`/incidents/${id}`, { method: "PATCH", body }),
  close: (id: string) =>
    apiFetch<Incident>(`/incidents/${id}/close`, { method: "POST" }),
};

export const ticketsApi = {
  list: (params: {
    incident_id?: string;
    website_id?: string;
    assigned_to?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}) =>
    apiFetch<{ data: Ticket[]; meta: PaginatedMeta }>(`/tickets${qs(params)}`),
  uploadAttachment: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiFetch<{ attachment_url: string }>("/tickets/attachments", { method: "POST", body });
  },
  attachment: (id: string) =>
    apiFetch<{ url: string; expires_at: string }>(`/tickets/${id}/attachment`),
  create: (body: {
    website_id: string;
    category: "website" | "help_desk" | "procurement";
    description: string;
    expectation: string;
    attachment_url?: string;
  }) => apiFetch<Ticket>("/tickets", { method: "POST", body }),
  update: (
    id: string,
    body: Partial<{
      status: string;
      sla_deadline: string | null;
      assigned_to: string | null;
    }>,
  ) => apiFetch<Ticket>(`/tickets/${id}`, { method: "PATCH", body }),
};

export const tasksApi = {
  list: (params: {
    page?: number;
    limit?: number;
    website_id?: string;
    assignee_id?: string;
    status?: string;
  } = {}) =>
    apiFetch<{ data: Task[]; meta: PaginatedMeta }>(`/tasks${qs(params)}`),
  create: (body: {
    website_id: string;
    assignee_id?: string;
    instruction_notes: string;
    attachment_url?: string;
    sla_deadline?: string;
  }) => apiFetch<Task>("/tasks", { method: "POST", body }),
  updateStatus: (id: string, status: string) =>
    apiFetch<Task>(`/tasks/${id}/status`, { method: "PATCH", body: { status } }),
};

export const workloadApi = {
  developers: () => apiFetch<DeveloperWorkload[]>("/workload/developers"),
};

export const notificationsApi = {
  list: (params: { page?: number; limit?: number; unread_only?: boolean } = {}) =>
    apiFetch<{ data: Notification[]; meta: PaginatedMeta; unread_count: number }>(
      `/notifications${qs({ ...params, channel: "dashboard" })}`,
    ),
  markRead: (id: string) =>
    apiFetch<Notification>(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () =>
    apiFetch<{ updated: number }>("/notifications/read-all", { method: "POST" }),
};

export const websitesApi = {
  list: (params: { page?: number; limit?: number; is_active?: boolean } = {}) =>
    apiFetch<{ data: Website[]; meta: PaginatedMeta }>(`/websites${qs(params)}`),
  get: (id: string) => apiFetch<Website>(`/websites/${id}`),
  create: (body: {
    name: string;
    domain: string;
    url: string;
    owner_id?: string | null;
    it_pic_id?: string | null;
    backup_it_pic_id?: string | null;
    monitoring_interval_minutes?: number;
    is_active?: boolean;
  }) => apiFetch<Website>("/websites", { method: "POST", body }),
  update: (
    id: string,
    body: Partial<{
      name: string;
      domain: string;
      url: string;
      owner_id: string | null;
      it_pic_id: string | null;
      backup_it_pic_id: string | null;
      monitoring_interval_minutes: number;
      is_active: boolean;
    }>,
  ) => apiFetch<Website>(`/websites/${id}`, { method: "PATCH", body }),
  remove: (id: string) =>
    apiFetch<void>(`/websites/${id}`, { method: "DELETE" }),
};

export const usersApi = {
  list: (params: { page?: number; limit?: number; role?: UserRole; is_active?: boolean } = {}) =>
    apiFetch<{ data: User[]; meta: PaginatedMeta }>(`/users${qs(params)}`),
  create: (body: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    telegram_chat_id?: string;
  }) => apiFetch<User>("/users", { method: "POST", body }),
  update: (
    id: string,
    body: Partial<{
      name: string;
      role: UserRole;
      telegram_chat_id: string | null;
      is_active: boolean;
      password: string;
    }>,
  ) => apiFetch<User>(`/users/${id}`, { method: "PATCH", body }),
};
