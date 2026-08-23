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

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const retryable = Boolean(onRetry) || /Gagal memuat|Sesi .*bermasalah|Server terlalu|Koneksi ke server/.test(message);
  return (
    <div className="error-banner" role="alert" aria-live="polite">
      <span>{message}</span>
      {retryable ? (
        <button
          type="button"
          className="btn btn-sm btn-neutral error-retry"
          onClick={onRetry ?? (() => window.location.reload())}
        >
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return <div className="success-banner">{message}</div>;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="pagination-bar">
      <span className="pagination-meta">
        Menampilkan {from}–{to} dari {total}
      </span>
      <div className="pagination-actions">
        <button type="button" className="btn btn-sm" onClick={onPrev} disabled={safePage <= 1}>
          Sebelumnya
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onNext}
          disabled={safePage >= totalPages}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
