"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProjectAreaTabs, ProjectRequestList } from "@/components/ProjectRequestUI";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState, PaginationBar } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { projectRequestsApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canCreateProjectRequest, canReviewProjectRequests } from "@/lib/format";
import type { ProjectRequest, ProjectRequestStatus } from "@/lib/types";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Semua status" },
  { value: "pending", label: "Menunggu review" },
  { value: "needs_info", label: "Perlu dilengkapi" },
  { value: "approved", label: "Disetujui — Draft dibuat" },
  { value: "rejected", label: "Ditolak" },
];

function canAccessRequests(role: string) {
  return canReviewProjectRequests(role) || canCreateProjectRequest(role);
}

export default function ProjectRequestsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ProjectRequest[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectRequestStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const reviewer = Boolean(user && canReviewProjectRequests(user.role));

  useEffect(() => {
    if (!authLoading && user && !canAccessRequests(user.role)) router.replace("/projects");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user || !canAccessRequests(user.role)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      projectRequestsApi
        .list({
          page,
          limit: 25,
          search: search.trim() || undefined,
          status: status || undefined,
        })
        .then((response) => {
          if (cancelled) return;
          setItems(response.data);
          setTotal(response.meta.total);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Gagal memuat Pengajuan Project");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, search.trim() ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, refreshNonce, search, status, user]);

  function changeSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function changeStatus(value: string) {
    setStatus(value as ProjectRequestStatus | "");
    setPage(1);
  }

  if (authLoading || !user || !canAccessRequests(user.role)) {
    return <AppShell title="Project"><LoadingState label="Memuat Pengajuan Project…" /></AppShell>;
  }

  const title = reviewer ? "Kelola Project" : "Project Saya";

  return (
    <AppShell title={title}>
      <ProjectAreaTabs role={user.role} active="requests" />
      <div className="project-request-page-header">
        <div>
          <span className="eyebrow">{reviewer ? "Project workspace" : "Project workspace"}</span>
          <h2>{reviewer ? "Pengajuan Project" : "Pengajuan Saya"}</h2>
          <p className="muted">{reviewer ? "Tinjau kebutuhan Project baru dari PIC Web." : "Pantau pengajuan Project yang Anda kirim."}</p>
        </div>
        <div className="project-request-page-actions">
          {reviewer ? <Link href="/projects?create=1" className="btn btn-primary">Tambah Project</Link> : <Link href="/projects/requests/new" className="btn btn-primary">Ajukan Project</Link>}
        </div>
      </div>

      <section className="project-request-filter-panel panel" aria-label="Cari Pengajuan Project">
        <div className="project-request-filter-grid">
          <div className="filter-field project-request-search-field">
            <label htmlFor="project-request-search">Cari</label>
            <input
              id="project-request-search"
              className="text-input"
              value={search}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="Nomor, nama Project, atau pengaju"
            />
          </div>
          <div className="filter-field">
            <span className="filter-field-label">Status</span>
            <Select value={status} onChange={changeStatus} options={STATUS_OPTIONS} aria-label="Filter status Pengajuan Project" />
          </div>
        </div>
      </section>

      {error ? <ErrorBanner message={error} onRetry={() => setRefreshNonce((current) => current + 1)} /> : null}
      {loading ? <LoadingState label="Memuat Pengajuan Project…" /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title={search || status ? "Pengajuan tidak ditemukan" : "Belum ada Pengajuan Project"}
          description={search || status ? "Coba ubah kata kunci atau status yang dipilih." : reviewer ? "Pengajuan dari PIC Web akan muncul di sini." : "Pengajuan Project yang Anda kirim akan muncul di sini."}
        />
      ) : null}
      {!loading && items.length > 0 ? <ProjectRequestList items={items} /> : null}
      {!loading && !error ? <PaginationBar page={page} pageSize={25} total={total} onPrev={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => current + 1)} /> : null}
    </AppShell>
  );
}
