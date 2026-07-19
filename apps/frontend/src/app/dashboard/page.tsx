"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ScreenshotImage } from "@/components/ScreenshotImage";
import { EmptyState, ErrorBanner, LoadingState, StatusPill } from "@/components/ui";
import { dashboardApi } from "@/lib/api-services";
import { formatRelative } from "@/lib/format";
import type { DashboardWebsiteCard, MonitoringStatus } from "@/lib/types";
import { ApiError } from "@/lib/api";

export default function DashboardPage() {
  const [cards, setCards] = useState<DashboardWebsiteCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<MonitoringStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await dashboardApi.list();
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
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return cards;
    return cards.filter((c) => (c.latest_result?.status || "unknown") === statusFilter);
  }, [cards, statusFilter]);

  return (
    <AppShell title="Dashboard">
      <div className="toolbar">
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as MonitoringStatus | "all")}
          aria-label="Filter status"
        >
          <option value="all">Semua status</option>
          <option value="normal">Normal</option>
          <option value="warning">Warning</option>
          <option value="down">Down</option>
          <option value="unknown">Unknown</option>
        </select>
        <span className="muted" style={{ fontSize: "0.9rem" }}>
          {filtered.length} website
        </span>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          title="Tidak ada website"
          description="Belum ada data monitoring untuk filter ini."
        />
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="card-grid">
          {filtered.map((card) => {
            const status = card.latest_result?.status || "unknown";
            return (
              <Link key={card.website.id} href={`/websites/${card.website.id}`} className="website-card">
                <div className="website-card-shot">
                  <ScreenshotImage
                    resultId={card.latest_result?.id}
                    hasScreenshot={Boolean(card.latest_result?.screenshot_url)}
                    alt={`Screenshot ${card.website.name}`}
                  />
                </div>
                <div className="website-card-body">
                  <div className="website-card-top">
                    <h3>{card.website.name}</h3>
                    <StatusPill status={status} />
                  </div>
                  <div className="website-card-meta">
                    <span>{card.website.domain}</span>
                  </div>
                  <div className="website-card-meta">
                    <span>
                      {card.latest_result
                        ? formatRelative(card.latest_result.checked_at)
                        : "Belum pernah dicek"}
                    </span>
                    {card.active_incident ? (
                      <span className="priority-tag high" style={{ fontSize: "0.78rem" }}>
                        Incident aktif
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </AppShell>
  );
}
