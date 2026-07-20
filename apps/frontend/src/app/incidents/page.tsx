"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
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
  const [websitesError, setWebsitesError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [websiteId, setWebsiteId] = useState("");
  const [tab, setTab] = useState<"active" | "all">("active");

  useEffect(() => {
    let cancelled = false;
    websitesApi
      .list({ limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setWebsites(res.data ?? []);
        setWebsitesError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setWebsites([]);
        setWebsitesError(
          err instanceof ApiError ? err.message : "Gagal memuat daftar website untuk filter",
        );
      });
    return () => {
      cancelled = true;
    };
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
      <div className="page-tabs" role="tablist" aria-label="Tampilan incident">
        <button
          type="button"
          className={`page-tab ${tab === "active" ? "active" : ""}`}
          role="tab"
          aria-selected={tab === "active"}
          onClick={() => setTab("active")}
        >
          Aktif
        </button>
        <button
          type="button"
          className={`page-tab ${tab === "all" ? "active" : ""}`}
          role="tab"
          aria-selected={tab === "all"}
          onClick={() => setTab("all")}
        >
          Semua
        </button>
      </div>

      <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: "0.92rem" }}>
        Daftar incident dari hasil monitoring website EGI.
      </p>

      <div className="toolbar">
        <Select
          value={websiteId}
          onChange={setWebsiteId}
          aria-label="Filter website"
          options={[
            { value: "", label: "Semua website" },
            ...websites.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
        <Select
          value={status}
          onChange={(v) => setStatus(v as IncidentStatus | "")}
          aria-label="Filter status"
          options={[
            { value: "", label: "Semua status" },
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In Progress" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <Select
          value={severity}
          onChange={(v) => setSeverity(v as Severity | "")}
          aria-label="Filter severity"
          options={[
            { value: "", label: "Semua severity" },
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {websitesError ? <ErrorBanner message={websitesError} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Tidak ada incident" description="Tidak ada data untuk filter ini." />
      ) : null}

      {!websitesError && websites.length === 0 ? (
        <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.88rem" }}>
          Filter website masih kosong — belum ada website di database. Jalankan seed atau tambah
          website di Kelola Website.
        </p>
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
