import {
  canManageIncidents as sharedCanManageIncidents,
  canManagePlatform as sharedCanManagePlatform,
  canManageProjects as sharedCanManageProjects,
  canViewProjectRegistry as sharedCanViewProjectRegistry,
  canViewUserStories as sharedCanViewUserStories,
  canViewDeveloperWorkload as sharedCanViewDeveloperWorkload,
  canViewIncidents as sharedCanViewIncidents,
  canViewTasks as sharedCanViewTasks,
  canCreateTaskIntake as sharedCanCreateTaskIntake,
  canCreateProjectRequest as sharedCanCreateProjectRequest,
  canReviewProjectRequests as sharedCanReviewProjectRequests,
  canViewTaskMonitoring as sharedCanViewTaskMonitoring,
  isEndUserPublicDashboard as sharedIsEndUserPublicDashboard,
  opensWebsiteExternallyFromDashboard as sharedOpensWebsiteExternallyFromDashboard,
  roleLabel as sharedRoleLabel,
} from "@egi/shared-types";
import type {
  IncidentStatus,
  MonitoringStatus,
  Severity,
  TaskStatus,
  UserRole,
} from "./types";

// Re-assign (not `export { ... }`) so Next/webpack resolves CJS named exports from @egi/shared-types.
export const canManageIncidents = sharedCanManageIncidents;
export const canManagePlatform = sharedCanManagePlatform;
export const canManageProjects = sharedCanManageProjects;
export const canViewProjectRegistry = sharedCanViewProjectRegistry;
export const canViewUserStories = sharedCanViewUserStories;
export const canViewIncidents = sharedCanViewIncidents;
export const canViewTasks = sharedCanViewTasks;
export const canCreateTaskIntake = sharedCanCreateTaskIntake;
export const canCreateProjectRequest = sharedCanCreateProjectRequest;
export const canReviewProjectRequests = sharedCanReviewProjectRequests;
export const canViewTaskMonitoring = sharedCanViewTaskMonitoring;
export const canViewDeveloperWorkload = sharedCanViewDeveloperWorkload;
export const isEndUserPublicDashboard = sharedIsEndUserPublicDashboard;
export const opensWebsiteExternallyFromDashboard =
  sharedOpensWebsiteExternallyFromDashboard;
export const roleLabel = (role: UserRole) => sharedRoleLabel(role);

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function overdueLabel(deadline?: string | null) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "Telat <1 jam";
  if (hours < 24) return `Telat ${hours} jam`;
  return `Telat ${Math.floor(hours / 24)} hari`;
}

export function formatRelative(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Kemarin";
  if (days < 7) return `${days} hari lalu`;
  return formatDateTime(value);
}

export function statusLabel(status: MonitoringStatus) {
  switch (status) {
    case "normal":
    case "warning":
      return "Aktif";
    case "down":
      return "Down";
    default:
      return "Unknown";
  }
}

export function severityLabel(severity: Severity) {
  switch (severity) {
    case "critical":
      return "Kritis";
    case "high":
      return "Tinggi";
    case "medium":
      return "Sedang";
    case "low":
      return "Rendah";
  }
}

export function incidentStatusLabel(status: IncidentStatus) {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In Progress";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
  }
}

export function ticketStatusLabel(status: string) {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In Progress";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return status.replace(/_/g, " ");
  }
}

export function taskStatusLabel(status: TaskStatus | string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In Progress";
    case "done":
      return "Done";
    default:
      return String(status).replace(/_/g, " ");
  }
}

/** Clean redundant "Website {name} Website …" titles for display. */
export function incidentDisplayTitle(title: string, websiteName?: string | null) {
  let cleaned = title.replace(/\s+/g, " ").trim();
  if (websiteName) {
    const escaped = websiteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned
      .replace(new RegExp(`^Website\\s+${escaped}\\s+Website\\s+`, "i"), "")
      .replace(new RegExp(`^Website\\s+${escaped}\\s+`, "i"), "")
      .replace(new RegExp(`^${escaped}\\s+Website\\s+`, "i"), "")
      .replace(new RegExp(`^${escaped}\\s+`, "i"), "");
  }
  cleaned = cleaned.replace(/^Website\s+/i, "").trim();
  if (!cleaned) return title.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function msLabel(ms?: number | null) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function localInputToIso(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function isoToLocalInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function clipText(value?: string | null, max = 120) {
  if (!value) return "—";
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}
