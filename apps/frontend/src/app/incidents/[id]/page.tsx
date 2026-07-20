"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { IconExternal } from "@/components/icons";
import { Select } from "@/components/Select";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PaginationBar,
  PriorityTag,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { incidentsApi, ticketsApi, websitesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import {
  canManageIncidents,
  formatDateTime,
  incidentDisplayTitle,
  incidentStatusLabel,
  ticketStatusLabel,
} from "@/lib/format";
import type { Incident, IncidentStatus, Severity, Ticket, Website } from "@/lib/types";

const TICKET_PAGE_SIZE = 5;

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

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
  const [ticketPage, setTicketPage] = useState(1);

  async function load() {
    setLoading(true);
    setError("");
    setTicketPage(1);
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
    if (!incident || severity === incident.severity) return;
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
  const pageTitle = website?.name || "Detail Incident";
  const displayTitle = incident
    ? incidentDisplayTitle(incident.title, website?.name)
    : "";

  const ticketSlice = useMemo(() => {
    const start = (ticketPage - 1) * TICKET_PAGE_SIZE;
    return tickets.slice(start, start + TICKET_PAGE_SIZE);
  }, [tickets, ticketPage]);

  const primaryAction =
    incident?.status === "open"
      ? {
          label: "Tandai In Progress",
          onClick: () => void updateStatus("in_progress"),
        }
      : incident?.status === "in_progress"
        ? {
            label: "Tandai Resolved",
            onClick: () => void updateStatus("resolved"),
          }
        : incident?.status === "resolved"
          ? {
              label: "Close Incident",
              onClick: () => void closeIncident(),
            }
          : null;

  return (
    <AppShell title={pageTitle}>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && incident ? (
        <div className="stack-gap">
          <div className="panel incident-summary">
            <div className="incident-summary-top">
              <div className="incident-summary-copy">
                <div className="incident-breadcrumb">
                  <Link href="/incidents">Incidents</Link>
                  <span aria-hidden>/</span>
                  <span>Detail</span>
                </div>
                <p className="incident-site-label">{website?.name || "Website"}</p>
                <h2 className="incident-summary-title">{displayTitle}</h2>
              </div>
              {website ? (
                <Link href={`/websites/${website.id}`} className="incident-link-btn">
                  <IconExternal />
                  Lihat website
                </Link>
              ) : null}
            </div>

            <div className="incident-chip-row">
              <PriorityTag severity={incident.severity} />
              <span className={`incident-status-chip status-${incident.status}`}>
                {incidentStatusLabel(incident.status)}
              </span>
              {website ? (
                <Link href={`/websites/${website.id}`} className="incident-domain-link">
                  {website.domain}
                </Link>
              ) : null}
            </div>

            <dl className="incident-facts">
              <div>
                <dt>Mulai</dt>
                <dd>{formatDateTime(incident.started_at)}</dd>
              </div>
              <div>
                <dt>Diperbarui</dt>
                <dd>{formatDateTime(incident.updated_at)}</dd>
              </div>
              {incident.resolved_at ? (
                <div>
                  <dt>Resolved</dt>
                  <dd>{formatDateTime(incident.resolved_at)}</dd>
                </div>
              ) : null}
              {incident.closed_at ? (
                <div>
                  <dt>Ditutup</dt>
                  <dd>{formatDateTime(incident.closed_at)}</dd>
                </div>
              ) : null}
            </dl>

            {actionError ? <ErrorBanner message={actionError} /> : null}

            {manage && (primaryAction || incident.status !== "closed") ? (
              <div className="incident-toolbar">
                {primaryAction ? (
                  <button
                    type="button"
                    className="incident-primary-btn"
                    disabled={busy}
                    onClick={primaryAction.onClick}
                  >
                    {primaryAction.label}
                  </button>
                ) : (
                  <span className="incident-toolbar-note muted">Incident sudah ditutup</span>
                )}

                <div className="incident-severity-control">
                  <label className="incident-severity-label" htmlFor="incident-priority">
                    Prioritas
                  </label>
                  <Select
                    id="incident-priority"
                    className="incident-priority-select"
                    value={incident.severity}
                    onChange={(value) => void updateSeverity(value as Severity)}
                    options={SEVERITY_OPTIONS}
                    disabled={busy}
                    aria-label="Ubah prioritas"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="incident-detail-grid">
            <section className="panel incident-side-panel">
              <h2 className="panel-title">Timeline</h2>
              <div className="timeline timeline-compact">
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
                    <strong>Ditutup</strong>
                    <span>{formatDateTime(incident.closed_at)}</span>
                  </div>
                ) : null}
                <div className="timeline-item">
                  <strong>Terakhir diperbarui</strong>
                  <span>{formatDateTime(incident.updated_at)}</span>
                </div>
              </div>
            </section>

            <section className="panel incident-side-panel">
              <h2 className="panel-title">Tiket terkait</h2>
              <div className="incident-side-body">
                {tickets.length === 0 ? (
                  <EmptyState title="Belum ada tiket terkait" />
                ) : (
                  <>
                    <div className="incident-ticket-list">
                      {ticketSlice.map((t) => (
                        <div key={t.id} className="incident-ticket-row">
                          <h3>{t.title}</h3>
                          <div className="list-meta">
                            <PriorityTag severity={t.priority} />
                            <span className="badge-soft">{ticketStatusLabel(t.status)}</span>
                            <span>Dibuat {formatDateTime(t.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <PaginationBar
                      page={ticketPage}
                      pageSize={TICKET_PAGE_SIZE}
                      total={tickets.length}
                      onPrev={() => setTicketPage((p) => Math.max(1, p - 1))}
                      onNext={() =>
                        setTicketPage((p) =>
                          Math.min(Math.ceil(tickets.length / TICKET_PAGE_SIZE), p + 1),
                        )
                      }
                    />
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
