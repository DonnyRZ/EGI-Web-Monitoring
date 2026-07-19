"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ScreenshotImage } from "@/components/ScreenshotImage";
import { IconExternal } from "@/components/icons";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PriorityTag,
  StatusPill,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { dashboardApi } from "@/lib/api-services";
import {
  clipText,
  formatDateTime,
  formatRelative,
  incidentStatusLabel,
  msLabel,
} from "@/lib/format";
import type { WebsiteDetailResponse } from "@/lib/types";

export default function WebsiteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<WebsiteDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await dashboardApi.website(id, 48);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Gagal memuat detail website");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = data?.website.name || "Detail Website";

  return (
    <AppShell
      title={title}
      actions={
        data ? (
          <a
            className="btn btn-primary"
            href={data.website.url}
            target="_blank"
            rel="noreferrer"
            style={{ marginLeft: 8 }}
          >
            <IconExternal />
            Buka Website
          </a>
        ) : null
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && data ? (
        <div className="stack-gap">
          <div className="detail-hero">
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <div className="screenshot-frame" style={{ border: "none", borderRadius: 0 }}>
                <ScreenshotImage
                  resultId={data.latest_result?.id}
                  hasScreenshot={Boolean(data.latest_result?.screenshot_url)}
                  alt={`Screenshot ${data.website.name}`}
                />
              </div>
            </div>

            <div className="stack-gap">
              <div className="panel">
                <h2 className="panel-title">Status terkini</h2>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                  <StatusPill status={data.latest_result?.status || "unknown"} />
                  <span className="muted" style={{ fontSize: "0.88rem" }}>
                    {data.latest_result
                      ? `Dicek ${formatRelative(data.latest_result.checked_at)}`
                      : "Belum ada hasil monitoring"}
                  </span>
                </div>
                <p style={{ margin: "0 0 8px", color: "var(--text-secondary)" }}>
                  {data.website.domain} · {data.website.url}
                </p>
                <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                  Interval: {data.website.monitoring_interval_minutes} menit ·{" "}
                  {data.website.is_active ? "Aktif" : "Nonaktif"}
                </p>
              </div>

              <div className="metrics-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="metric">
                  <div className="metric-label">HTTP Status</div>
                  <div className="metric-value">
                    {data.latest_result?.http_status ?? "—"}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Response Time</div>
                  <div className="metric-value">
                    {msLabel(data.latest_result?.response_time_ms)}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Render Time</div>
                  <div className="metric-value">
                    {msLabel(data.latest_result?.render_time_ms)}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Error</div>
                  <div className="metric-value" style={{ fontSize: "0.95rem", fontFamily: "var(--font-sans)" }}>
                    {clipText(data.latest_result?.error_message, 140)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {data.active_incident ? (
            <div className="panel">
              <h2 className="panel-title">Incident aktif</h2>
              <div className="list-item" style={{ padding: 0, border: "none" }}>
                <div className="list-item-main">
                  <Link href={`/incidents/${data.active_incident.id}`} className="list-title">
                    {data.active_incident.title}
                  </Link>
                  <div className="list-meta">
                    <PriorityTag severity={data.active_incident.severity} />
                    <span>{incidentStatusLabel(data.active_incident.status)}</span>
                    <span>Mulai {formatDateTime(data.active_incident.started_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="panel">
            <h2 className="panel-title">Riwayat monitoring</h2>
            {data.monitoring_history.length === 0 ? (
              <EmptyState title="Belum ada riwayat" />
            ) : (
              data.monitoring_history.map((r) => (
                <div key={r.id} className="history-row">
                  <StatusPill status={r.status} />
                  <div>
                    <div>{formatDateTime(r.checked_at)}</div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      HTTP {r.http_status ?? "—"} · {msLabel(r.response_time_ms)} · render{" "}
                      {msLabel(r.render_time_ms)}
                    </div>
                  </div>
                  <span className="error-clip" title={r.error_message || undefined}>
                    {r.error_message ? clipText(r.error_message, 80) : ""}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h2 className="panel-title">Riwayat incident</h2>
            {data.incident_history.length === 0 ? (
              <EmptyState title="Belum ada incident" />
            ) : (
              <div className="list-panel" style={{ border: "none" }}>
                {data.incident_history.map((inc) => (
                  <Link key={inc.id} href={`/incidents/${inc.id}`} className="list-item">
                    <div className="list-item-main">
                      <h3 className="list-title">{inc.title}</h3>
                      <div className="list-meta">
                        <PriorityTag severity={inc.severity} />
                        <span>{incidentStatusLabel(inc.status)}</span>
                        <span>{formatDateTime(inc.started_at)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
