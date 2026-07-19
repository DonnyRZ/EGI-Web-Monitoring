"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PriorityTag,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { incidentsApi, websitesApi } from "@/lib/api-services";
import {
  formatRelative,
  incidentStatusLabel,
} from "@/lib/format";
import type { Incident, IncidentStatus, Severity, Website } from "@/lib/types";

export default function IncidentsPage() {
  const [items, setItems] = useState<Incident[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [websiteId, setWebsiteId] = useState("");
  const [tab, setTab] = useState<"active" | "all">("active");

  useEffect(() => {
    websitesApi
      .list({ limit: 100 })
      .then((res) => setWebsites(res.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await incidentsApi.list({
          limit: 50,
          status: status || undefined,
          severity: severity || undefined,
          website_id: websiteId || undefined,
          active_only: tab === "active" && !status ? true : undefined,
        });
        if (!cancelled) setItems(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Gagal memuat incidents");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, severity, websiteId, tab]);

  const websiteMap = Object.fromEntries(websites.map((w) => [w.id, w]));

  return (
    <AppShell title="Incidents">
      <div style={{ display: "flex", gap: 18, borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            borderRadius: 0,
            borderBottom: tab === "active" ? "2px solid var(--egi-blue)" : "2px solid transparent",
            color: tab === "active" ? "var(--egi-blue-dark)" : undefined,
          }}
          onClick={() => setTab("active")}
        >
          Aktif
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            borderRadius: 0,
            borderBottom: tab === "all" ? "2px solid var(--egi-blue)" : "2px solid transparent",
            color: tab === "all" ? "var(--egi-blue-dark)" : undefined,
          }}
          onClick={() => setTab("all")}
        >
          Semua
        </button>
      </div>

      <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: "0.92rem" }}>
        Daftar incident dari hasil monitoring website EGI.
      </p>

      <div className="toolbar">
        <select
          className="filter-select"
          value={websiteId}
          onChange={(e) => setWebsiteId(e.target.value)}
          aria-label="Filter website"
        >
          <option value="">Semua website</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as IncidentStatus | "")}
          aria-label="Filter status"
        >
          <option value="">Semua status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          className="filter-select"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity | "")}
          aria-label="Filter severity"
        >
          <option value="">Semua severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Tidak ada incident" description="Tidak ada data untuk filter ini." />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="list-panel">
          {items.map((inc) => {
            const site = websiteMap[inc.website_id];
            return (
              <Link key={inc.id} href={`/incidents/${inc.id}`} className="list-item">
                <div className="list-item-main">
                  <div className="list-kicker">{site?.name || "Website"}</div>
                  <h3 className="list-title">{inc.title}</h3>
                  <p className="list-summary">
                    Status {incidentStatusLabel(inc.status)}
                    {site ? ` · ${site.domain}` : ""}
                  </p>
                  <div className="list-meta">
                    <PriorityTag severity={inc.severity} />
                    <span>{incidentStatusLabel(inc.status)}</span>
                    <span>Diperbarui {formatRelative(inc.updated_at)}</span>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                  {formatRelative(inc.started_at)}
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </AppShell>
  );
}
