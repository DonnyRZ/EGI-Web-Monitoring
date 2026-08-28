"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { FilterSheet, useBodyScrollLock, useDialogFocus } from "@/components/ResponsiveOverlay";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { taskMonitoringApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canViewTaskMonitoring, formatDateTime, initials } from "@/lib/format";
import { loadProjectPicDeveloperScope } from "@/lib/project-scope";
import type {
  Severity,
  TaskBusinessStatus,
  TaskMonitoringFilters,
  TaskMonitoringOverviewResponse,
  TaskMonitoringPeriod,
  TaskMonitoringRow,
  UserStoryStatus,
} from "@/lib/types";

const STATUS_LABELS: Record<TaskBusinessStatus, string> = {
  new: "Baru",
  in_progress: "Sedang dikerjakan",
  waiting_pic: "Baru",
  blocked: "Terkendala",
  done: "Selesai",
};

const STORY_STATUS_LABELS: Record<UserStoryStatus, string> = {
  backlog: "Belum dimulai",
  ready: "Siap dikerjakan",
  in_progress: "Sedang dikerjakan",
  review: "Dalam peninjauan",
  done: "Selesai",
  blocked: "Terkendala",
};

const PRIORITY_LABELS: Record<Severity, string> = {
  critical: "Kritis",
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah",
};

const PERIOD_OPTIONS: Array<{ value: TaskMonitoringPeriod; label: string }> = [
  { value: "7d", label: "7 hari terakhir" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "90d", label: "90 hari terakhir" },
  { value: "month", label: "Bulan berjalan" },
];

const EMPTY_SUMMARY: TaskMonitoringOverviewResponse["summary"] = {
  projects: 0,
  active: 0,
  new: 0,
  in_progress: 0,
  blocked: 0,
  overdue: 0,
  completed_period: 0,
  attention_projects: 0,
};

type OverviewProject = TaskMonitoringOverviewResponse["data"][number];

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<TaskMonitoringOverviewResponse | null>(null);
  const [filters, setFilters] = useState<TaskMonitoringFilters>({ projects: [], websites: [], developers: [] });
  const [period, setPeriod] = useState<TaskMonitoringPeriod>("30d");
  const [projectId, setProjectId] = useState("");
  const [developerId, setDeveloperId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedProject, setSelectedProject] = useState<OverviewProject | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [projectScopeReady, setProjectScopeReady] = useState(false);
  const [isProjectPicDeveloper, setIsProjectPicDeveloper] = useState(false);

  const showTechnicalDetail = user?.role === "bos_it" || user?.role === "developer";
  const scopePending = user?.role === "developer" && !projectScopeReady;
  const canMonitor = Boolean(
    user
    && canViewTaskMonitoring(user.role)
    && (user.role !== "developer" || (projectScopeReady && isProjectPicDeveloper)),
  );

  useEffect(() => {
    if (authLoading || !user) return;
    if (user.role !== "developer") {
      setProjectScopeReady(true);
      setIsProjectPicDeveloper(false);
      return;
    }
    let cancelled = false;
    setProjectScopeReady(false);
    loadProjectPicDeveloperScope(user.id)
      .then((value) => {
        if (!cancelled) {
          setIsProjectPicDeveloper(value);
          setProjectScopeReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsProjectPicDeveloper(false);
          setProjectScopeReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.role]);

  useEffect(() => {
    if (!authLoading && user && !scopePending && !canMonitor) window.location.replace("/dashboard");
  }, [authLoading, canMonitor, scopePending, user]);

  useEffect(() => {
    if (!canMonitor) return;
    taskMonitoringApi.filters().then(setFilters).catch(() => undefined);
  }, [canMonitor, user?.id]);

  const visibleDevelopers = useMemo(
    () => filters.developers.filter((developer) => !projectId || developer.project_ids.includes(projectId)),
    [filters.developers, projectId],
  );

  useEffect(() => {
    if (authLoading || !canMonitor) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      taskMonitoringApi.overview({
        period,
        project_id: projectId || undefined,
        developer_id: developerId || undefined,
        status: status || undefined,
        search: search.trim() || undefined,
      }).then((response) => {
        if (!cancelled) {
          setOverview(response);
          setSelectedProject((current) => current ? response.data.find((item) => item.key === current.key) ?? null : null);
        }
      }).catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Gagal memuat ringkasan pekerjaan");
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, search.trim() ? 180 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authLoading, canMonitor, developerId, period, projectId, refreshNonce, search, status]);

  if (!user || scopePending || !canMonitor) {
    return <AppShell title="Task Monitoring"><LoadingState /></AppShell>;
  }

  const summary = overview?.summary ?? EMPTY_SUMMARY;
  return (
    <AppShell title="Task Monitoring">
      <div className="task-mobile-heading">
        <h2>Pekerjaan per Project</h2>
        <p>Ringkasan status dan perhatian pekerjaan.</p>
      </div>
      <TaskSearchBar
        search={search}
        onSearchChange={setSearch}
        onOpenFilters={() => setFilterOpen(true)}
      />
      <p className="task-summary-context">Metrik mengikuti pencarian dan filter yang dipilih.</p>
      <TaskSummaryCards summary={summary} period={period} />
      <TaskMobileSummary summary={summary} />

      <TaskFilterDropdowns
        filters={filters}
        period={period}
        projectId={projectId}
        developerId={developerId}
        status={status}
        visibleDevelopers={visibleDevelopers}
        onPeriodChange={setPeriod}
        onProjectChange={(value) => { setProjectId(value); setDeveloperId(""); }}
        onDeveloperChange={setDeveloperId}
        onStatusChange={setStatus}
      />
      <FilterSheet
        open={filterOpen}
        title="Filter Task Monitoring"
        activeCount={[period !== "30d", Boolean(projectId), Boolean(developerId), Boolean(status)].filter(Boolean).length}
        onClose={() => setFilterOpen(false)}
        onApply={() => setFilterOpen(false)}
      >
        <TaskFilterFields
          filters={filters}
          period={period}
          projectId={projectId}
          developerId={developerId}
          status={status}
          visibleDevelopers={visibleDevelopers}
          onPeriodChange={setPeriod}
          onProjectChange={(value) => { setProjectId(value); setDeveloperId(""); }}
          onDeveloperChange={setDeveloperId}
          onStatusChange={setStatus}
        />
      </FilterSheet>

      {error ? <ErrorBanner message={error} onRetry={() => setRefreshNonce((value) => value + 1)} /> : null}
      {loading ? <LoadingState label="Memuat ringkasan pekerjaan…" /> : null}
      {!loading && !error && (!overview || overview.data.length === 0) ? (
        <EmptyState title="Belum ada pekerjaan yang perlu dipantau" description="Project dengan Task aktif akan muncul di sini. Pilih status Selesai untuk melihat pekerjaan yang selesai pada periode terpilih." />
      ) : null}
      {!loading && overview && overview.data.length > 0 ? <ProjectTaskTable projects={overview.data} onOpen={setSelectedProject} /> : null}

      {selectedProject ? (
        <ProjectTaskDrawer
          project={selectedProject}
          filters={filters}
          technicalView={Boolean(showTechnicalDetail)}
          canOverride={user.role === "superadmin" || user.role === "bos_it"}
          onClose={() => setSelectedProject(null)}
          onChanged={() => setRefreshNonce((value) => value + 1)}
        />
      ) : null}
    </AppShell>
  );
}

function TaskSearchBar({
  search,
  onSearchChange,
  onOpenFilters,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
}) {
  return (
    <section className="task-search-panel panel" aria-label="Cari Task Monitoring">
      <div className="task-search-field filter-field">
        <label htmlFor="task-overview-search">Cari</label>
        <input id="task-overview-search" className="text-input project-search" placeholder="Cari Project atau Task" value={search} onChange={(event) => onSearchChange(event.target.value)} />
      </div>
      <div className="task-search-actions">
        <button type="button" className="btn btn-neutral mobile-filter-trigger" onClick={onOpenFilters}>Filter</button>
      </div>
    </section>
  );
}

type TaskFilterDropdownProps = {
  filters: TaskMonitoringFilters;
  period: TaskMonitoringPeriod;
  projectId: string;
  developerId: string;
  status: string;
  visibleDevelopers: TaskMonitoringFilters["developers"];
  onPeriodChange: (value: TaskMonitoringPeriod) => void;
  onProjectChange: (value: string) => void;
  onDeveloperChange: (value: string) => void;
  onStatusChange: (value: string) => void;
};

function TaskFilterDropdowns({
  filters,
  period,
  projectId,
  developerId,
  status,
  visibleDevelopers,
  onPeriodChange,
  onProjectChange,
  onDeveloperChange,
  onStatusChange,
}: TaskFilterDropdownProps) {
  return (
    <section className="task-filter-panel panel task-overview-filter-panel" aria-label="Filter Task Monitoring">
      <TaskFilterFields filters={filters} period={period} projectId={projectId} developerId={developerId} status={status} visibleDevelopers={visibleDevelopers} onPeriodChange={onPeriodChange} onProjectChange={onProjectChange} onDeveloperChange={onDeveloperChange} onStatusChange={onStatusChange} />
    </section>
  );
}

function TaskFilterFields({
  filters,
  period,
  projectId,
  developerId,
  status,
  visibleDevelopers,
  onPeriodChange,
  onProjectChange,
  onDeveloperChange,
  onStatusChange,
}: TaskFilterDropdownProps) {
  return (
    <div className="task-overview-filters">
      <div className="filter-field">
        <span className="filter-field-label">Periode selesai</span>
        <Select value={period} onChange={(value) => onPeriodChange(value as TaskMonitoringPeriod)} options={PERIOD_OPTIONS} aria-label="Filter periode selesai" />
      </div>
      <div className="filter-field">
        <span className="filter-field-label">Project</span>
        <Select value={projectId} onChange={onProjectChange} options={[{ value: "", label: "Semua Project" }, ...filters.projects.map((project) => ({ value: project.id, label: project.name }))]} aria-label="Filter Project" />
      </div>
      <div className="filter-field">
        <span className="filter-field-label">Developer</span>
        <Select value={developerId} onChange={onDeveloperChange} options={[{ value: "", label: "Semua Developer" }, ...visibleDevelopers.map((developer) => ({ value: developer.id, label: developer.name }))]} aria-label="Filter Developer" />
      </div>
      <div className="filter-field">
        <span className="filter-field-label">Status</span>
        <Select value={status} onChange={onStatusChange} options={[{ value: "", label: "Semua status" }, { value: "new", label: "Baru" }, { value: "in_progress", label: "Sedang dikerjakan" }, { value: "blocked", label: "Terkendala" }, { value: "done", label: "Selesai" }]} aria-label="Filter status Task" />
      </div>
    </div>
  );
}

function TaskSummaryCards({ summary, period }: { summary: TaskMonitoringOverviewResponse["summary"]; period: TaskMonitoringPeriod }) {
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "periode terpilih";
  return (
    <section className="task-summary-grid task-overview-summary-grid" aria-label="Ringkasan pekerjaan">
      <SummaryCard label="Task aktif" value={summary.active} />
      <SummaryCard label="Baru" value={summary.new} tone="warning" />
      <SummaryCard label="Sedang dikerjakan" value={summary.in_progress} tone="progress" />
      <SummaryCard label="Terlambat" value={summary.overdue} tone="danger" />
      <SummaryCard label="Terkendala" value={summary.blocked} tone="danger" />
      <SummaryCard label={`Selesai · ${periodLabel}`} value={summary.completed_period} tone="success" />
    </section>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className={`task-summary-card ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function TaskMobileSummary({ summary }: { summary: TaskMonitoringOverviewResponse["summary"] }) {
  return (
    <section className="task-mobile-summary" aria-label="Ringkasan singkat pekerjaan">
      <div><strong>{summary.projects}</strong><span>Project</span></div>
      <div><strong>{summary.active}</strong><span>Task aktif</span></div>
      <div><strong>{summary.attention_projects}</strong><span>Perhatian</span></div>
    </section>
  );
}

function ProjectTaskTable({ projects, onOpen }: { projects: OverviewProject[]; onOpen: (project: OverviewProject) => void }) {
  return (
    <section className="panel task-overview-table-panel" aria-label="Ringkasan pekerjaan per Project">
      <div className="panel-heading-row task-overview-table-heading">
        <div>
          <span className="eyebrow">Project</span>
          <h3 className="panel-title">Pekerjaan yang perlu dipantau</h3>
        </div>
        <span className="muted">{projects.length} ruang kerja</span>
      </div>
      <div className="task-overview-table" role="table" aria-label="Ringkasan pekerjaan per Project">
        <div className="task-overview-table-header" role="row">
          <span role="columnheader">Project</span>
          <span role="columnheader">Pekerjaan aktif</span>
          <span role="columnheader">Perlu perhatian</span>
          <span role="columnheader">Selesai</span>
          <span role="columnheader">Penanggung jawab</span>
          <span role="columnheader">Kondisi</span>
        </div>
        {projects.map((project) => <ProjectTaskRow key={project.key} project={project} onOpen={() => onOpen(project)} />)}
      </div>
      <div className="task-mobile-project-list" aria-label="Daftar Project">
        {projects.map((project) => <ProjectTaskMobileCard key={project.key} project={project} onOpen={() => onOpen(project)} />)}
      </div>
    </section>
  );
}

function projectCondition(project: OverviewProject) {
  const label = project.blocked_count > 0
    ? "Terkendala"
    : project.overdue_count > 0 || project.attention_count > 0
      ? "Perlu perhatian"
      : project.active_count > 0
        ? "Berjalan"
        : "Selesai";
  const className = label === "Terkendala"
    ? "danger"
    : label === "Perlu perhatian"
      ? "warning"
      : label === "Selesai"
        ? "success"
        : "progress";
  return { label, className };
}

function ProjectTaskRow({ project, onOpen }: { project: OverviewProject; onOpen: () => void }) {
  const title = project.project?.name ?? "Task Umum";
  const condition = projectCondition(project);

  return (
    <button type="button" className="task-overview-table-row" role="row" onClick={onOpen}>
      <span className="task-overview-project-cell" role="cell">
        <strong>{title}</strong>
        <small>{project.website_count ? `${project.website_count} Website terkait` : "Belum ada Website terkait"}</small>
      </span>
      <span className="task-overview-metric-cell" role="cell">
        <strong>{project.active_count}</strong>
        <small>{project.new_count} baru · {project.in_progress_count} dikerjakan</small>
      </span>
      <span className="task-overview-metric-cell attention" role="cell">
        <strong>{project.attention_count}</strong>
        <small>{project.overdue_count} terlambat · {project.blocked_count} terkendala</small>
      </span>
      <span className="task-overview-metric-cell" role="cell">
        <strong>{project.completed_period_count}</strong>
        <small>pada periode terpilih</small>
      </span>
      <span className="task-overview-owner-cell" role="cell">
        {project.pic_developer ? <><span className="member-avatar">{initials(project.pic_developer.name)}</span><span><strong>{project.pic_developer.name}</strong><small>{project.developer_count} Developer</small></span></> : <span><strong>Belum ditentukan</strong><small>{project.developer_count} Developer</small></span>}
      </span>
      <span className={`task-overview-condition ${condition.className}`} role="cell">{condition.label}</span>
    </button>
  );
}

function ProjectTaskMobileCard({ project, onOpen }: { project: OverviewProject; onOpen: () => void }) {
  const title = project.project?.name ?? "Task Umum";
  const condition = projectCondition(project);
  const websiteLabel = project.website_count
    ? `${project.website_count} website`
    : title === "Task Umum"
      ? "Pekerjaan umum"
      : "Belum ada website";
  const metrics: Array<{ label: string; value: number; tone?: "attention" | "danger" | "done" }> = [
    { label: "Aktif", value: project.active_count },
    { label: "Baru", value: project.new_count, tone: project.new_count > 0 ? "attention" : undefined },
    { label: "Dikerjakan", value: project.in_progress_count },
    { label: "Terlambat", value: project.overdue_count, tone: project.overdue_count > 0 ? "danger" : undefined },
    { label: "Terkendala", value: project.blocked_count, tone: project.blocked_count > 0 ? "danger" : undefined },
    { label: "Selesai", value: project.completed_period_count, tone: project.completed_period_count > 0 ? "done" : undefined },
  ];

  return (
    <button type="button" className="task-mobile-project-card" onClick={onOpen} aria-label={`Buka Task pada ${title}`}>
      <span className="task-mobile-project-head">
        <span className="task-mobile-project-copy">
          <strong>{title}</strong>
          <small>{websiteLabel}</small>
        </span>
        <span className={`task-overview-condition ${condition.className}`}>{condition.label}</span>
      </span>
      <span className="task-mobile-project-metrics">
        {metrics.map((metric) => (
          <span key={metric.label} className={`task-mobile-project-metric ${metric.tone ?? ""}`}>
            <strong>{metric.value}</strong>
            <small>{metric.label}</small>
          </span>
        ))}
      </span>
      <span className="task-mobile-project-foot">
        <span className="task-mobile-project-owner">
          {project.pic_developer ? <span className="member-avatar">{initials(project.pic_developer.name)}</span> : null}
          <span>
            <strong>{project.pic_developer?.name ?? "Belum ditentukan"}</strong>
            <small>{project.developer_count} developer</small>
          </span>
        </span>
        <span className="task-mobile-detail-link">Lihat task&nbsp; →</span>
      </span>
    </button>
  );
}

function ProjectTaskDrawer({ project, filters, technicalView, canOverride, onClose, onChanged }: {
  project: OverviewProject;
  filters: TaskMonitoringFilters;
  technicalView: boolean;
  canOverride: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<TaskMonitoringRow[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [taskDeveloperId, setTaskDeveloperId] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskMonitoringRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  const projectDevelopers = useMemo(
    () => project.key === "general" ? filters.developers : filters.developers.filter((developer) => developer.project_ids.includes(project.key)),
    [filters.developers, project.key],
  );
  const taskQueryKey = `${project.key}|${taskSearch}|${taskStatus}|${taskDeveloperId}`;

  useEffect(() => {
    setPage(1);
    setSelectedTask(null);
    setDetailError("");
  }, [taskQueryKey]);

  useEffect(() => {
    let cancelled = false;
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setError("");
    taskMonitoringApi.list({
      page,
      limit: 50,
      project_id: project.key === "general" ? undefined : project.key,
      scope: project.key === "general" ? "general" : undefined,
      developer_id: taskDeveloperId || undefined,
      status: taskStatus || undefined,
      search: taskSearch.trim() || undefined,
    }).then((response) => {
      if (cancelled) return;
      setRows((current) => page === 1 ? response.data : [...current, ...response.data]);
      setHasMore(response.meta.page < response.meta.total_pages);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : "Gagal memuat Task");
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
        setLoadingMore(false);
      }
    });
    return () => { cancelled = true; };
  }, [page, project.key, taskDeveloperId, taskSearch, taskStatus]);

  useBodyScrollLock(true);
  useDialogFocus(true, drawerRef, undefined, onClose, searchRef);

  async function openTask(row: TaskMonitoringRow) {
    setDetailError("");
    setSelectedTask(row);
    setDetailLoading(true);
    try {
      setSelectedTask(await taskMonitoringApi.get(row.source_id, row.source));
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : "Gagal memuat detail Task");
    } finally {
      setDetailLoading(false);
    }
  }

  function updateRow(updated: TaskMonitoringRow) {
    setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
    setSelectedTask(updated);
    onChanged();
  }

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside ref={drawerRef} className="task-project-drawer" role="dialog" aria-modal="true" aria-label={`Task pada ${project.project?.name ?? "Task Umum"}`} onClick={(event) => event.stopPropagation()}>
        {selectedTask ? (
          <div className="task-detail-drawer-content"><TaskDetailView row={selectedTask} technicalView={technicalView} canOverride={canOverride} loading={detailLoading} error={detailError} onBack={() => setSelectedTask(null)} onClose={onClose} onUpdated={updateRow} /></div>
        ) : (
          <>
            <div className="drawer-header task-project-drawer-header">
              <div>
                <span className="eyebrow">{project.project ? "Project" : "Task Umum"}</span>
                <h2>{project.project?.name ?? "Task Umum"}</h2>
                <p className="muted">{project.project ? `${project.website_count} Website terkait` : "Pekerjaan yang tidak terkait satu Project"}</p>
              </div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup detail Project">×</button>
            </div>
            <div className="task-project-drawer-summary">
              <div><strong>{project.active_count}</strong><span>Task aktif</span></div>
              <div><strong>{project.attention_count}</strong><span>Perlu perhatian</span></div>
              <div><strong>{project.completed_period_count}</strong><span>Selesai periode ini</span></div>
            </div>
            <div className="task-drawer-filters">
              <div className="filter-field task-drawer-search">
                <label htmlFor="drawer-task-search">Cari Task</label>
                <input ref={searchRef} id="drawer-task-search" className="text-input" placeholder="Cari judul Task" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} />
              </div>
              <div className="filter-field"><span className="filter-field-label">Status</span><Select value={taskStatus} onChange={setTaskStatus} options={[{ value: "", label: "Semua status" }, { value: "new", label: "Baru" }, { value: "in_progress", label: "Sedang dikerjakan" }, { value: "blocked", label: "Terkendala" }, { value: "done", label: "Selesai" }]} aria-label="Filter status Task di Project" /></div>
              <div className="filter-field"><span className="filter-field-label">Developer</span><Select value={taskDeveloperId} onChange={setTaskDeveloperId} options={[{ value: "", label: "Semua Developer" }, ...projectDevelopers.map((developer) => ({ value: developer.id, label: developer.name }))]} aria-label="Filter Developer di Project" /></div>
            </div>
            {error ? <ErrorBanner message={error} /> : null}
            {loading ? <LoadingState label="Memuat Task…" /> : null}
            {!loading && !error && rows.length === 0 ? <EmptyState title="Belum ada Task" description="Tidak ada Task yang sesuai dengan filter ini." /> : null}
            {!loading && rows.length > 0 ? <div className="task-project-list">{rows.map((row) => <TaskDrawerRow key={row.id} row={row} onOpen={() => void openTask(row)} />)}</div> : null}
            {!loading && rows.length > 0 && hasMore ? <button type="button" className="btn btn-neutral task-drawer-load-more" disabled={loadingMore} onClick={() => setPage((value) => value + 1)}>{loadingMore ? "Memuat…" : "Muat Task berikutnya"}</button> : null}
          </>
        )}
      </aside>
    </div>
  );
}

function TaskDrawerRow({ row, onOpen }: { row: TaskMonitoringRow; onOpen: () => void }) {
  return (
    <button type="button" className={`task-drawer-row ${row.is_overdue ? "overdue" : ""}`} onClick={onOpen}>
      <span className="task-drawer-row-main"><strong>{row.title}</strong>{row.ticket_number ? <small className="task-drawer-row-number">{row.ticket_number}</small> : null}<small>{row.website ? `${row.website.name} · ${row.website.domain}` : "Cakupan Project"}</small></span>
      <span className={`task-business-status ${row.status}`}>{STATUS_LABELS[row.status]}</span>
      <span className="task-drawer-row-meta"><small>{row.pic_developer?.name ?? "Belum ditentukan"}</small><small className={row.is_overdue ? "text-danger" : "muted"}>{row.is_overdue ? "Terlambat" : row.due_date ? formatDateTime(row.due_date) : "Tanpa deadline"}</small></span>
    </button>
  );
}

function TaskDetailView({ row, technicalView, canOverride, loading, error, onBack, onClose, onUpdated }: {
  row: TaskMonitoringRow;
  technicalView: boolean;
  canOverride: boolean;
  loading: boolean;
  error: string;
  onBack: () => void;
  onClose: () => void;
  onUpdated: (row: TaskMonitoringRow) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [lastStatusRequest, setLastStatusRequest] = useState("");
  const progress = row.status === "done" ? "Sudah selesai" : row.status === "in_progress" ? "Sedang dikerjakan" : row.status === "blocked" ? "Terkendala" : "Belum dimulai";

  async function updateStatus(value: string) {
    setSaving(true);
    setActionError("");
    setLastStatusRequest(value);
    try {
      onUpdated(await taskMonitoringApi.updateStatus(row.source_id, value || null));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal memperbarui status Task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="drawer-header task-detail-drawer-header">
        <div>
          <button type="button" className="text-link task-drawer-back" onClick={onBack}>← Kembali ke Project</button>
          <span className="eyebrow">Detail Task</span>
          <h2>{row.title}</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup detail Task">×</button>
      </div>
      {loading ? <LoadingState label="Memuat detail Task…" /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} onRetry={() => void updateStatus(lastStatusRequest)} /> : null}
      <div className="task-detail-badges"><span className={`task-business-status ${row.status}`}>{STATUS_LABELS[row.status]}</span><span className={`priority-tag ${row.priority}`}>{PRIORITY_LABELS[row.priority]}</span>{row.is_overdue ? <span className="overdue-label">Terlambat</span> : null}</div>
      <dl className="task-detail-facts"><div><dt>Nomor Task</dt><dd>{row.ticket_number ?? "Belum tersedia"}</dd></div><div><dt>Dibuat oleh</dt><dd>{row.created_by?.name ?? "Tidak diketahui"}</dd></div><div><dt>Project</dt><dd>{row.project?.name ?? "Task Umum"}</dd></div><div><dt>Website</dt><dd>{row.website ? <Link href={`/websites/${row.website.id}`}>{row.website.name}</Link> : "Tidak ada Website khusus"}</dd></div><div><dt>Penanggung jawab</dt><dd>{row.pic_developer?.name ?? "Belum ditentukan"}</dd></div><div><dt>Deadline</dt><dd>{row.due_date ? formatDateTime(row.due_date) : "Belum ditentukan"}</dd></div></dl>
      <section className="task-detail-section"><span className="eyebrow">Masalah atau kebutuhan</span><p>{row.business?.problem || row.summary || "Tidak ada keterangan."}</p>{row.business?.expectation ? <><span className="eyebrow">Hasil yang diharapkan</span><p>{row.business.expectation}</p></> : null}</section>
      {row.business?.category === "new_website" ? <section className="task-detail-section"><span className="eyebrow">Permintaan website baru</span><dl className="task-detail-request-facts"><div><dt>Nama website</dt><dd>{row.business.requested_website_name || "Belum ditentukan"}</dd></div><div><dt>Domain</dt><dd>{row.business.requested_domain || "Belum tersedia"}</dd></div><div><dt>Project usulan</dt><dd>{row.business.requested_project_name || (row.project?.name ?? "Belum ditentukan")}</dd></div></dl><p className="muted">Website belum dibuat dan belum masuk monitoring. Project serta penanggung jawabnya ditentukan setelah permintaan ditinjau.</p></section> : null}
      {technicalView ? <section className="task-detail-section"><div className="panel-heading-row"><div><span className="eyebrow">Pekerjaan teknis</span><h3 className="panel-title">Rincian pekerjaan</h3></div><span className="muted">{row.story_count} bagian</span></div>{row.stories.length === 0 ? <p className="muted">Pekerjaan teknis belum dibuat.</p> : <div className="task-detail-stories">{row.stories.map((story) => <div className="task-detail-story" key={story.id}><strong>{story.title}</strong><span className={`story-status-label ${story.status}`}>{STORY_STATUS_LABELS[story.status]}</span><span className="muted">{story.primary_developer?.name ?? "Belum ada Developer utama"}{story.collaborators.length ? ` · ${story.collaborators.length} Developer pendamping` : ""}</span></div>)}</div>}</section> : <section className="task-detail-section"><span className="eyebrow">Progress pekerjaan</span><p className="task-progress-message">{progress}</p></section>}
      {canOverride && row.source === "task" ? <section className="task-detail-actions"><span className="eyebrow">Status Task</span><p className="muted">Ubah status hanya jika kondisi pekerjaan belum tercermin dengan benar.</p><Select value={row.status === "waiting_pic" ? "new" : row.status} onChange={(value) => void updateStatus(value)} options={[{ value: "new", label: "Baru" }, { value: "in_progress", label: "Sedang dikerjakan" }, { value: "blocked", label: "Terkendala" }, { value: "done", label: "Selesai" }]} disabled={saving} aria-label="Status Task" /></section> : null}
    </>
  );
}
