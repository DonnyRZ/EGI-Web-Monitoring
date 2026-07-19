import type { MonitoringStatus, Severity } from "@/lib/types";
import { severityLabel, statusLabel } from "@/lib/format";

export function StatusPill({ status }: { status?: MonitoringStatus | null }) {
  const s = status || "unknown";
  return (
    <span className={`status-pill ${s}`}>
      <span className={`status-dot ${s}`} />
      {statusLabel(s)}
    </span>
  );
}

export function PriorityTag({ severity }: { severity: Severity }) {
  return <span className={`priority-tag ${severity}`}>{severityLabel(severity)}</span>;
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="state-box">
      <h3>{title}</h3>
      {description ? <p style={{ margin: 0 }}>{description}</p> : null}
    </div>
  );
}

export function LoadingState({ label = "Memuat data…" }: { label?: string }) {
  return <div className="state-box">{label}</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner">{message}</div>;
}
