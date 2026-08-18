"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { IconExternal } from "@/components/icons";
import { Select } from "@/components/Select";
import { ScreenshotImage } from "@/components/ScreenshotImage";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { dashboardApi, tasksApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { formatRelative, isEndUserPublicDashboard, opensWebsiteExternallyFromDashboard, statusLabel } from "@/lib/format";
import type { DashboardWebsiteCard } from "@/lib/types";
import { ApiError } from "@/lib/api";

type StatusFilter = "active" | "down" | "my_tasks";

export default function DashboardPage() {
  const { user } = useAuth();
  const isDeveloper = user?.role === "developer";
  const isGallery = isEndUserPublicDashboard(user?.role);
  const [cards, setCards] = useState<DashboardWebsiteCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [myTaskWebsiteIds, setMyTaskWebsiteIds] = useState<Set<string> | null>(null);
  const openExternally = opensWebsiteExternallyFromDashboard(user?.role);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const status = isGallery
          ? undefined
          : statusFilter === "my_tasks"
            ? undefined
            : statusFilter;
        const res = await dashboardApi.list(status);
        if (!cancelled) setCards(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Gagal memuat dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, isGallery]);

  useEffect(() => {
    if (statusFilter !== "my_tasks" || !isDeveloper || myTaskWebsiteIds) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await tasksApi.list({ limit: 100 });
        if (cancelled) return;
        const ids = new Set(
          res.data
            .filter((t) => t.status === "pending" || t.status === "in_progress")
            .map((t) => t.website_id),
        );
        setMyTaskWebsiteIds(ids);
      } catch {
        if (!cancelled) setMyTaskWebsiteIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, isDeveloper, myTaskWebsiteIds]);

  const filtered = useMemo(() => {
    if (statusFilter === "my_tasks") {
      if (!myTaskWebsiteIds) return [];
      return cards.filter((c) => myTaskWebsiteIds.has(c.website.id));
    }
    return cards;
  }, [cards, statusFilter, myTaskWebsiteIds]);

  return (
    <AppShell title="Dashboard">
      <section className={`dashboard-intro ${isGallery ? "gallery-intro" : ""}`}>
        <div>
          <span className="eyebrow">{isGallery ? "Live monitoring" : "Operations overview"}</span>
          <p className="muted">
            {isGallery
              ? "Pantau kesehatan website EGI dari satu gallery yang mudah dipindai."
              : "Ringkasan kesehatan website dan akses cepat ke detail monitoring."}
          </p>
        </div>
        <div className="dashboard-count-card">
          <strong>{loading ? "—" : filtered.length}</strong>
          <span>{statusFilter === "my_tasks" ? "website dengan tugas saya" : "website ditampilkan"}</span>
        </div>
      </section>

      {!isGallery ? (
        <section className="dashboard-toolbar panel" aria-label="Filter dashboard">
          <div className="toolbar-label">
            <span className="eyebrow">Tampilan</span>
            <strong>Health overview</strong>
          </div>
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            aria-label="Filter status"
            options={[
              { value: "active", label: "Website aktif" },
              { value: "down", label: "Website down" },
              ...(isDeveloper ? [{ value: "my_tasks", label: "Website dengan tugas saya" }] : []),
            ]}
          />
          <span className="toolbar-result">
            {statusFilter === "my_tasks" && !myTaskWebsiteIds ? "Memuat…" : `${filtered.length} website`}
          </span>
        </section>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
      {loading || (statusFilter === "my_tasks" && !myTaskWebsiteIds) ? <LoadingState /> : null}

      {!loading &&
      !error &&
      filtered.length === 0 &&
      (statusFilter !== "my_tasks" || myTaskWebsiteIds) ? (
        <EmptyState
          title={statusFilter === "my_tasks" ? "Tidak ada tugas aktif" : "Tidak ada website"}
          description={
            statusFilter === "my_tasks"
              ? "Situs dengan tugas aktif untuk Anda akan muncul di sini."
              : "Belum ada data monitoring untuk filter ini."
          }
        />
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="card-grid">
          {filtered.map((card) => {
            const isPic = isDeveloper && card.website.it_pic_id === user?.id;
            const isBackupPic = isDeveloper && !isPic && card.website.backup_it_pic_id === user?.id;
            const monitoringStatus = card.latest_result?.status ?? "unknown";
            const body = (
              <>
                <div className="website-card-shot">
                  <ScreenshotImage
                    resultId={card.latest_result?.id}
                    hasScreenshot={Boolean(card.latest_result?.screenshot_url)}
                    signedUrl={card.latest_result?.screenshot_signed_url}
                    alt={`Screenshot ${card.website.name}`}
                  />
                </div>
                <div className="website-card-body">
                  <div className="website-card-top">
                    <h3>{card.website.name}</h3>
                  </div>
                  <div className="website-card-meta">
                    <span>{card.website.domain}</span>
                    {openExternally ? (
                      <span className="website-card-external" aria-hidden>
                        <IconExternal />
                      </span>
                    ) : null}
                  </div>
                  <div className="website-card-meta">
                    <span className={`project-health ${monitoringStatus}`}>
                      <span className={`project-health-dot ${monitoringStatus}`} />
                      {statusLabel(monitoringStatus)}
                    </span>
                    <span className="website-card-checked">
                      {card.latest_result
                        ? formatRelative(card.latest_result.checked_at)
                        : "Belum pernah dicek"}
                    </span>
                    {card.active_incident ? (
                      <span className="priority-tag high">
                        Incident aktif
                      </span>
                    ) : null}
                    {isPic ? (
                      <span className="priority-tag">
                        Anda PIC
                      </span>
                    ) : null}
                    {isBackupPic ? (
                      <span className="priority-tag">
                        Anda backup PIC
                      </span>
                    ) : null}
                  </div>
                </div>
              </>
            );

            if (openExternally) {
              return (
                <a
                  key={card.website.id}
                  href={card.website.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="website-card"
                >
                  {body}
                </a>
              );
            }

            return (
              <Link
                key={card.website.id}
                href={`/websites/${card.website.id}`}
                className="website-card"
              >
                {body}
              </Link>
            );
          })}
        </div>
      ) : null}
    </AppShell>
  );
}
