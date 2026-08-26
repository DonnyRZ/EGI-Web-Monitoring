"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useAuth } from "@/lib/auth-context";
import {
  canViewIncidents,
  formatRelative,
  incidentStatusLabel,
} from "@/lib/format";
import type { Incident, IncidentStatus, Severity, Website } from "@/lib/types";

export default function IncidentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Incident[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websitesError, setWebsitesError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [websiteId, setWebsiteId] = useState("");
  const [tab, setTab] = useState<"active" | "all">("active");
  const [onlyMySites, setOnlyMySites] = useState(false);
  const isDeveloper = user?.role === "developer";
  const isPicWeb = user?.role === "pic_web";

  useEffect(() => {
    if (!authLoading && user && !canViewIncidents(user.role)) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !canViewIncidents(user.role)) return;
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
  }, [user]);

  useEffect(() => {
    if (!user || !canViewIncidents(user.role)) return;
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
  }, [status, severity, websiteId, tab, user]);

  if (!user || !canViewIncidents(user.role)) {
    return (
      <AppShell title="Incidents">
        <LoadingState />
      </AppShell>
    );
  }

  const websiteMap = Object.fromEntries(websites.map((w) => [w.id, w]));
  const mySiteIds = new Set(
    isDeveloper
      ? websites
          .filter((w) => w.it_pic_id === user.id || w.backup_it_pic_id === user.id)
          .map((w) => w.id)
      : [],
  );
  const websiteOptions = onlyMySites
    ? websites.filter((w) => mySiteIds.has(w.id))
    : websites;
  const displayItems = onlyMySites ? items.filter((inc) => mySiteIds.has(inc.website_id)) : items;

  function toggleOnlyMySites() {
    const next = !onlyMySites;
    setOnlyMySites(next);
    if (next && websiteId && !mySiteIds.has(websiteId)) {
      setWebsiteId("");
    }
  }

  return (
    <AppShell title="Incidents">
      <section className="page-intro page-intro-compact">
        <div className="dashboard-count-card incident-count-card">
          <strong>{loading ? "—" : displayItems.length}</strong>
          <span>{tab === "active" ? "incident aktif" : "incident ditemukan"}</span>
        </div>
      </section>
      <div className="page-tabs" role="tablist" aria-label="Tampilan incident">
        <div className="page-tabs-list">
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
      </div>

      <section className="incident-filter-panel panel">
        <div className="incident-filter-actions">
          <button type="button" className="text-link filter-reset" onClick={() => { setWebsiteId(""); setStatus(""); setSeverity(""); setOnlyMySites(false); }}>Reset filter</button>
        </div>
        <div className="toolbar">
        {isDeveloper ? (
          <button
            type="button"
            className={`filter-toggle ${onlyMySites ? "active" : ""}`}
            aria-pressed={onlyMySites}
            onClick={toggleOnlyMySites}
          >
            Hanya situs saya
          </button>
        ) : null}
        <Select
          value={websiteId}
          onChange={setWebsiteId}
          aria-label="Filter website"
          options={[
            { value: "", label: onlyMySites || isPicWeb ? "Semua situs saya" : "Semua website" },
            ...websiteOptions.map((w) => ({ value: w.id, label: w.name })),
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
      </section>

      {error ? <ErrorBanner message={error} /> : null}
      {websitesError ? <ErrorBanner message={websitesError} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && displayItems.length === 0 ? (
        <EmptyState
          title="Tidak ada incident"
          description={
            onlyMySites || isPicWeb
              ? "Tidak ada incident untuk situs yang menjadi tanggung jawab Anda."
              : "Tidak ada data untuk filter ini."
          }
        />
      ) : null}

      {!websitesError && websites.length === 0 ? (
        <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.88rem" }}>
          Filter website masih kosong — belum ada website di database. Jalankan seed atau tambah
          website di Kelola Website.
        </p>
      ) : null}

      {!loading && displayItems.length > 0 ? (
        <div className="list-panel">
          {displayItems.map((inc) => {
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
