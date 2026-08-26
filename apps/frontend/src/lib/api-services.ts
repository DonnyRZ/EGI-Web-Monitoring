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
  MyWorkResponse,
  Project,
  ProjectAssignments,
  ProjectListSummary,
  ProjectRosterCandidate,
  Severity,
  Task,
  TaskMonitoringFilters,
  TaskMonitoringOverviewResponse,
  TaskMonitoringPeriod,
  TaskMonitoringRow,
  TaskMonitoringSummary,
  Ticket,
  User,
  UserRole,
  UserStory,
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
  guest: () =>
    apiFetch<LoginResponse>("/auth/guest", {
      method: "POST",
      body: {},
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
  list: (status?: "active" | "down") =>
    apiFetch<{ data: DashboardWebsiteCard[] }>(`/dashboard${qs({ status })}`),
  website: (id: string, history_limit = 48) =>
    apiFetch<WebsiteDetailResponse>(
      `/dashboard/websites/${id}${qs({ history_limit })}`,
    ),
};

export const monitoringApi = {
  get: (id: string) => apiFetch<MonitoringResult>(`/monitoring-results/${id}`),
};

export const incidentsApi = {
  activeCount: () => apiFetch<{ count: number }>("/incidents/summary/active-count"),
  context: (id: string) => apiFetch<{ incident: Incident; website: Website | null; tickets: Ticket[] }>(`/incidents/${id}/context`),
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
    project_id?: string;
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
    website_id?: string;
    project_id?: string;
    title?: string;
    category: "website" | "help_desk" | "procurement";
    description: string;
    expectation: string;
    attachment_url?: string;
    priority?: Severity;
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

export const taskIntakeApi = {
  create: (body: {
    title: string;
    website_id?: string;
    project_id?: string;
    category: "website" | "help_desk" | "procurement";
    description: string;
    expectation: string;
    attachment_url?: string;
    priority?: Severity;
  }) => apiFetch<Ticket>("/task-intake", { method: "POST", body }),
};

export const projectsApi = {
  scopeSummary: () => apiFetch<{ has_pic_developer: boolean }>("/projects/summary/scope"),
  list: (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: "draft" | "active" | "archived";
    missing_pic_web?: boolean;
    missing_pic_developer?: boolean;
    missing_developer_team?: boolean;
    has_active_tickets?: boolean;
    has_overdue_work?: boolean;
  } = {}) =>
    apiFetch<{ data: ProjectListSummary[]; meta: PaginatedMeta }>(`/projects${qs(params)}`),
  get: (id: string) => apiFetch<Project>(`/projects/${id}`),
  create: (body: { name: string; description?: string; status?: "draft" | "active" | "archived" }) =>
    apiFetch<Project>("/projects", { method: "POST", body }),
  update: (
    id: string,
    body: Partial<{ name: string; description: string | null; status: "draft" | "active" | "archived" }>,
  ) => apiFetch<Project>(`/projects/${id}`, { method: "PATCH", body }),
  updateAssignments: (id: string, body: ProjectAssignments) =>
    apiFetch<Project & { warnings?: string[] }>(`/projects/${id}/assignments`, { method: "PUT", body }),
  updateWebsites: (id: string, website_ids: string[]) =>
    apiFetch<Project>(`/projects/${id}/websites`, { method: "PUT", body: { website_ids } }),
  addWebsite: (id: string, body: {
    website_id?: string;
    name?: string;
    domain?: string;
    url?: string;
    monitoring_interval_minutes?: number;
  }) => apiFetch<Project>(`/projects/${id}/websites`, { method: "POST", body }),
  removeWebsite: (id: string, websiteId: string) =>
    apiFetch<Project>(`/projects/${id}/websites/${websiteId}`, { method: "DELETE" }),
  roster: (role: "pic_web" | "developer") =>
    apiFetch<ProjectRosterCandidate[]>(`/projects/roster${qs({ role })}`),
};

type UserStoryListParams = {
  page?: number;
  limit?: number;
  project_id?: string;
  website_id?: string;
  developer_id?: string;
  status?: string;
  priority?: string;
  overdue?: boolean;
  has_ticket?: boolean;
  search?: string;
};

export const userStoriesApi = {
  list: (params: UserStoryListParams = {}) => apiFetch<{ data: UserStory[]; meta: PaginatedMeta }>(`/user-stories${qs(params)}`),
  listForProject: (projectId: string, params: Omit<UserStoryListParams, "project_id"> = {}) =>
    apiFetch<{ data: UserStory[]; meta: PaginatedMeta }>(`/projects/${projectId}/user-stories${qs(params)}`),
  get: (id: string) => apiFetch<UserStory>(`/user-stories/${id}`),
  create: (projectId: string, body: {
    title: string;
    description?: string;
    acceptance_criteria?: string;
    website_id?: string | null;
    priority?: string;
    primary_developer_id?: string | null;
    collaborator_ids?: string[];
    due_date?: string | null;
  }) => apiFetch<UserStory>(`/projects/${projectId}/user-stories`, { method: "POST", body }),
  update: (id: string, body: Partial<{
    title: string;
    description: string | null;
    acceptance_criteria: string | null;
    website_id: string | null;
    priority: string;
    status: string;
    primary_developer_id: string | null;
    collaborator_ids: string[];
    due_date: string | null;
  }>) => apiFetch<UserStory>(`/user-stories/${id}`, { method: "PATCH", body }),
  createFromTicket: (ticketId: string, body: {
    title: string;
    description?: string;
    acceptance_criteria?: string;
    website_id?: string | null;
    priority?: string;
    primary_developer_id?: string | null;
    collaborator_ids?: string[];
    due_date?: string | null;
  }) => apiFetch<UserStory>(`/tickets/${ticketId}/create-story`, { method: "POST", body }),
  meWorkSummary: () => apiFetch<{ pending: number; in_progress: number; overdue: number; done: number }>("/me/work/summary"),
  meWork: () => apiFetch<MyWorkResponse>("/me/work"),
};

/** Read/update compatibility surface for historical direct-assignment tasks. */
export const legacyTasksApi = {
  list: (params: {
    page?: number;
    limit?: number;
    website_id?: string;
    assignee_id?: string;
    status?: string;
  } = {}) =>
    apiFetch<{ data: Task[]; meta: PaginatedMeta }>(`/tasks${qs(params)}`),
  updateStatus: (id: string, status: string) =>
    apiFetch<Task>(`/tasks/${id}/status`, { method: "PATCH", body: { status } }),
};

export const taskMonitoringApi = {
  overview: (params: {
    period?: TaskMonitoringPeriod;
    project_id?: string;
    website_id?: string;
    developer_id?: string;
    status?: string;
    search?: string;
  } = {}) => apiFetch<TaskMonitoringOverviewResponse>(`/task-monitoring/overview${qs(params)}`),
  list: (params: {
    page?: number;
    limit?: number;
    project_id?: string;
    website_id?: string;
    developer_id?: string;
    status?: string;
    priority?: string;
    overdue?: boolean;
    needs_action?: boolean;
    search?: string;
    scope?: "general";
  } = {}) => apiFetch<{
    data: TaskMonitoringRow[];
    summary: TaskMonitoringSummary;
    meta: PaginatedMeta;
  }>(`/task-monitoring${qs(params)}`),
  filters: () => apiFetch<TaskMonitoringFilters>("/task-monitoring/filters"),
  get: (id: string, source?: "task" | "legacy_task") =>
    apiFetch<TaskMonitoringRow>(`/task-monitoring/${id}${qs({ source })}`),
  updateStatus: (id: string, status: string | null) =>
    apiFetch<TaskMonitoringRow>(`/task-monitoring/${id}/status`, { method: "PATCH", body: { status } }),
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
    project_id?: string | null;
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
