"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { WebsiteWall } from "@/components/website/WebsiteWall";
import { dashboardApi, legacyTasksApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { isEndUserPublicDashboard } from "@/lib/format";
import type { DashboardWebsiteCard } from "@/lib/types";
import { ApiError } from "@/lib/api";

type StatusFilter = "active" | "down" | "my_tasks";

function dashboardPriority(card: DashboardWebsiteCard) {
  if (card.active_incident) return 0;
  const status = card.latest_result?.status;
  if (status === "down") return 1;
  if (status === "warning") return 2;
  if (status === "unknown") return 3;
  return 4;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const isDeveloper = user?.role === "developer";
  const isGallery = isEndUserPublicDashboard(user?.role);
  const [cards, setCards] = useState<DashboardWebsiteCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [myTaskWebsiteIds, setMyTaskWebsiteIds] = useState<Set<string> | null>(null);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
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
  }, [authLoading, user, statusFilter, isGallery]);

  useEffect(() => {
    if (authLoading || !user || statusFilter !== "my_tasks" || !isDeveloper || myTaskWebsiteIds) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await legacyTasksApi.list({ limit: 100 });
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
  }, [authLoading, user, statusFilter, isDeveloper, myTaskWebsiteIds]);

  const filtered = useMemo(() => {
    let result: DashboardWebsiteCard[];
    if (statusFilter === "my_tasks") {
      if (!myTaskWebsiteIds) return [];
      result = cards.filter((c) => myTaskWebsiteIds.has(c.website.id));
    } else {
      result = cards;
    }
    return [...result].sort((a, b) => dashboardPriority(a) - dashboardPriority(b));
  }, [cards, statusFilter, myTaskWebsiteIds]);

  useEffect(() => {
    if (selectedWebsiteId && !filtered.some((card) => card.website.id === selectedWebsiteId)) {
      setSelectedWebsiteId(null);
    }
  }, [filtered, selectedWebsiteId]);

  return (
    <AppShell title="Dashboard">
      {isGallery ? <section className="dashboard-intro gallery-intro">
        <div>
          <span className="eyebrow">Live monitoring</span>
          <p className="muted">Pantau kesehatan website EGI dari satu gallery yang mudah dipindai.</p>
        </div>
      </section> : null}

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
        <WebsiteWall
          cards={filtered}
          selectedWebsiteId={selectedWebsiteId}
          publicView={isGallery}
          isCurrentPic={(card) =>
            isDeveloper && "it_pic_id" in card.website && card.website.it_pic_id === user?.id
          }
          isBackupPic={(card) =>
            isDeveloper &&
            "backup_it_pic_id" in card.website &&
            card.website.backup_it_pic_id === user?.id &&
            !("it_pic_id" in card.website && card.website.it_pic_id === user?.id)
          }
          onSelect={setSelectedWebsiteId}
        />
      ) : null}
    </AppShell>
  );
}
