import type {
  IncidentStatus,
  MonitoringStatus,
  Severity,
  UserRole,
} from "./types";

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
      return "Normal";
    case "warning":
      return "Warning";
    case "down":
      return "Down";
    default:
      return "Unknown";
  }
}

export function severityLabel(severity: Severity) {
  switch (severity) {
    case "critical":
      return "Prioritas Kritis";
    case "high":
      return "Prioritas Tinggi";
    case "medium":
      return "Prioritas Sedang";
    case "low":
      return "Prioritas Rendah";
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

export function roleLabel(role: UserRole) {
  switch (role) {
    case "it_ops":
      return "IT Ops";
    case "helpdesk":
      return "Helpdesk";
    case "business_owner":
      return "Business Owner";
    case "developer":
      return "Developer";
    case "end_user":
      return "End User";
  }
}

export function msLabel(ms?: number | null) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function clipText(value?: string | null, max = 120) {
  if (!value) return "—";
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function canManageIncidents(role?: UserRole | null) {
  return role === "helpdesk" || role === "it_ops";
}

export function isItOps(role?: UserRole | null) {
  return role === "it_ops";
}
