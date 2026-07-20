import { apiFetch } from "./api";
import type {
  DashboardWebsiteCard,
  Incident,
  IncidentStatus,
  LoginResponse,
  MonitoringResult,
  Notification,
  PaginatedMeta,
  Severity,
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
  list: (params: { incident_id?: string; page?: number; limit?: number } = {}) =>
    apiFetch<{ data: Ticket[]; meta: PaginatedMeta }>(`/tickets${qs(params)}`),
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
    owner_id?: string;
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
