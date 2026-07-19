"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PriorityTag,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { incidentsApi, ticketsApi, websitesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import {
  canManageIncidents,
  formatDateTime,
  incidentStatusLabel,
} from "@/lib/format";
import type { Incident, IncidentStatus, Severity, Ticket, Website } from "@/lib/types";

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [website, setWebsite] = useState<Website | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const inc = await incidentsApi.get(id);
      setIncident(inc);
      const [site, ticketRes] = await Promise.all([
        websitesApi.get(inc.website_id).catch(() => null),
        ticketsApi.list({ incident_id: id, limit: 50 }),
      ]);
      setWebsite(site);
      setTickets(ticketRes.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat incident");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function updateStatus(status: IncidentStatus) {
    if (!incident) return;
    setBusy(true);
    setActionError("");
    try {
      const updated = await incidentsApi.update(incident.id, { status });
      setIncident(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal memperbarui status");
    } finally {
      setBusy(false);
    }
  }

  async function updateSeverity(severity: Severity) {
    if (!incident) return;
    setBusy(true);
    setActionError("");
    try {
      const updated = await incidentsApi.update(incident.id, { severity });
      setIncident(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal memperbarui severity");
    } finally {
      setBusy(false);
    }
  }

  async function closeIncident() {
    if (!incident) return;
    setBusy(true);
    setActionError("");
    try {
      const updated = await incidentsApi.close(incident.id);
      setIncident(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal menutup incident");
    } finally {
      setBusy(false);
    }
  }

  const manage = canManageIncidents(user?.role);

  return (
    <AppShell title="Detail Incident">
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && incident ? (
        <div className="stack-gap">
          <div className="panel">
            <div className="list-kicker">{website?.name || "Website"}</div>
            <h2 className="list-title" style={{ marginBottom: 10 }}>
              {incident.title}
            </h2>
            <div className="list-meta" style={{ marginBottom: 16 }}>
              <PriorityTag severity={incident.severity} />
              <span className="badge-soft">{incidentStatusLabel(incident.status)}</span>
              {website ? (
                <Link href={`/websites/${website.id}`} style={{ color: "var(--egi-blue-dark)" }}>
                  {website.domain}
                </Link>
              ) : null}
            </div>

            {actionError ? <ErrorBanner message={actionError} /> : null}

            {manage ? (
              <div className="row-actions" style={{ marginTop: 8 }}>
                {incident.status === "open" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void updateStatus("in_progress")}
                  >
                    Tandai In Progress
                  </button>
                ) : null}
                {incident.status === "in_progress" ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void updateStatus("resolved")}
                  >
                    Tandai Resolved
                  </button>
                ) : null}
                {incident.status === "resolved" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void closeIncident()}
                  >
                    Close Incident
                  </button>
                ) : null}
                <select
                  className="filter-select"
                  value={incident.severity}
                  disabled={busy}
                  onChange={(e) => void updateSeverity(e.target.value as Severity)}
                  aria-label="Ubah severity"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <h2 className="panel-title">Timeline</h2>
            <div className="timeline">
              <div className="timeline-item">
                <strong>Incident dimulai</strong>
                <span>{formatDateTime(incident.started_at)}</span>
              </div>
              {incident.resolved_at ? (
                <div className="timeline-item">
                  <strong>Resolved</strong>
                  <span>{formatDateTime(incident.resolved_at)}</span>
                </div>
              ) : null}
              {incident.closed_at ? (
                <div className="timeline-item">
                  <strong>Closed</strong>
                  <span>{formatDateTime(incident.closed_at)}</span>
                </div>
              ) : null}
              <div className="timeline-item">
                <strong>Terakhir diperbarui</strong>
                <span>{formatDateTime(incident.updated_at)}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2 className="panel-title">Tiket terkait</h2>
            {tickets.length === 0 ? (
              <EmptyState title="Belum ada tiket" description="Tidak ada tiket untuk incident ini." />
            ) : (
              <div className="list-panel" style={{ border: "none" }}>
                {tickets.map((t) => (
                  <div key={t.id} className="list-item">
                    <div className="list-item-main">
                      <h3 className="list-title" style={{ fontSize: "1rem" }}>
                        {t.title}
                      </h3>
                      <div className="list-meta">
                        <PriorityTag severity={t.priority} />
                        <span className="badge-soft">{t.status}</span>
                        <span>Dibuat {formatDateTime(t.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
