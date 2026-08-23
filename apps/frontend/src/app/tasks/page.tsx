"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { taskIntakeApi, taskMonitoringApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canCreateTaskIntake, canViewTaskMonitoring, formatDateTime, initials } from "@/lib/format";
import type {
  Severity,
  TaskBusinessStatus,
  TaskMonitoringFilters,
  TaskMonitoringRow,
  TaskMonitoringSummary,
} from "@/lib/types";

const STATUS_LABELS: Record<TaskBusinessStatus, string> = {
  new: "Baru",
  in_progress: "Sedang ditangani",
  waiting_pic: "Menunggu PIC teknis",
  blocked: "Terblokir",
  done: "Selesai",
};

const PRIORITY_LABELS: Record<Severity, string> = {
  critical: "Kritis",
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah",
};

type TaskScope = "project" | "website" | "general";
type TaskCategory = "website" | "help_desk" | "procurement";

const EMPTY_SUMMARY: TaskMonitoringSummary = {
  total: 0,
  needs_action: 0,
  new: 0,
  in_progress: 0,
  waiting_pic: 0,
  blocked: 0,
  overdue: 0,
  done: 0,
};

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<TaskMonitoringRow[]>([]);
  const [summary, setSummary] = useState<TaskMonitoringSummary>(EMPTY_SUMMARY);
  const [filters, setFilters] = useState<TaskMonitoringFilters>({ projects: [], websites: [], developers: [] });
  const [projectId, setProjectId] = useState("");
  const [developerId, setDeveloperId] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TaskMonitoringRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const technicalView = user?.role === "bos_it" || user?.role === "developer";
  const showDeveloperFilter = user?.role === "bos_it" || user?.role === "developer";

  useEffect(() => {
    if (!authLoading && user && !canViewTaskMonitoring(user.role)) router.replace("/dashboard");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !canViewTaskMonitoring(user.role)) return;
    taskMonitoringApi.filters().then(setFilters).catch(() => undefined);
  }, [user?.id, user?.role]);

  useEffect(() => {
    setPage(1);
  }, [projectId, developerId, status, priority, overdueOnly, needsActionOnly, search, showDeveloperFilter]);

  useEffect(() => {
    if (authLoading || !user || !canViewTaskMonitoring(user.role)) return;
    let cancelled = false;
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setError("");
    const timer = window.setTimeout(() => {
      taskMonitoringApi.list({
        page,
        limit: 50,
        project_id: projectId || undefined,
        developer_id: showDeveloperFilter ? developerId || undefined : undefined,
        status: status || undefined,
        priority: priority || undefined,
        overdue: overdueOnly || undefined,
        needs_action: needsActionOnly || undefined,
        search: search.trim() || undefined,
      }).then((response) => {
        if (cancelled) return;
        setRows((current) => {
          const next = page === 1 ? response.data : [...current, ...response.data];
          setSelected((selectedRow) => selectedRow ? next.find((row) => row.id === selectedRow.id) ?? null : null);
          return next;
        });
        setSummary(response.summary);
        setHasMore(response.meta.page < response.meta.total_pages);
      }).catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Gagal memuat Task Monitoring");
      }).finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authLoading, user, page, projectId, developerId, status, priority, overdueOnly, needsActionOnly, search, showDeveloperFilter, refreshNonce]);
  const visibleDevelopers = useMemo(
    () => filters.developers.filter((developer) => !projectId || developer.project_ids.includes(projectId)),
    [filters.developers, projectId],
  );
  const groupedRows = useMemo(() => {
    const groups = new Map<string, { name: string; rows: TaskMonitoringRow[] }>();
    for (const row of rows) {
      const key = row.project?.id ?? "general";
      const group = groups.get(key) ?? { name: row.project?.name ?? "General / tanpa Project", rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [rows]);

  if (!user || !canViewTaskMonitoring(user.role)) {
    return <AppShell title="Task Monitoring"><LoadingState /></AppShell>;
  }

  return (
    <AppShell title="Task Monitoring">
      <section className="project-page-intro">
        <div>
          <span className="eyebrow">Satu pusat pekerjaan</span>
          <p className="muted">
            {technicalView
              ? "Pantau Task dan rincian pekerjaan teknisnya, lengkap dengan Project, developer, deadline, dan blocker."
              : "Lihat apa yang sedang berjalan, apa yang terlambat, dan apa yang membutuhkan perhatian Anda. Detail teknis tetap diringkas."}
          </p>
        </div>
        {canCreateTaskIntake(user.role) ? <button type="button" className="btn btn-primary task-page-cta" onClick={() => setCreateOpen(true)}>Buat Task</button> : null}
      </section>

      <section className="task-filter-panel panel" aria-label="Filter Task Monitoring">
        <div className="filter-panel-header">
          <div>
            <span className="eyebrow">Filter workspace</span>
            <h3 className="panel-title">Temukan Task yang perlu Anda lihat</h3>
          </div>
          <button
            type="button"
            className="text-link filter-reset"
            onClick={() => {
              setProjectId("");
              setDeveloperId("");
              setStatus("");
              setPriority("");
              setSearch("");
              setOverdueOnly(false);
              setNeedsActionOnly(false);
            }}
          >
            Reset filter
          </button>
        </div>
        <div className={`task-monitoring-filters ${showDeveloperFilter ? "with-developer-filter" : ""}`}>
          <div className="filter-field filter-field-search">
            <label htmlFor="task-search">Cari</label>
            <input id="task-search" className="text-input project-search" placeholder="Judul Task, Project, atau Website" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="filter-field">
            <span className="filter-field-label">Project</span>
            <Select value={projectId} onChange={(value) => { setProjectId(value); setDeveloperId(""); }} options={[{ value: "", label: user.role === "developer" ? "Semua Project Saya" : "Semua Project" }, ...filters.projects.map((project) => ({ value: project.id, label: project.name }))]} aria-label="Filter Project" />
          </div>
          {showDeveloperFilter ? <div className="filter-field"><span className="filter-field-label">Developer</span><Select value={developerId} onChange={setDeveloperId} options={[{ value: "", label: "Semua developer" }, ...visibleDevelopers.map((developer) => ({ value: developer.id, label: developer.name }))]} aria-label="Filter developer" /></div> : null}
          <div className="filter-field"><span className="filter-field-label">Status</span><Select value={status} onChange={setStatus} options={[{ value: "", label: "Semua status" }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]} aria-label="Filter status Task" /></div>
          <div className="filter-field"><span className="filter-field-label">Priority</span><Select value={priority} onChange={setPriority} options={[{ value: "", label: "Semua priority" }, ...Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))]} aria-label="Filter priority Task" /></div>
        </div>
        <div className="filter-quick-actions">
          <span className="filter-quick-label">Tampilkan cepat</span>
          <button type="button" className={`filter-toggle ${needsActionOnly ? "active" : ""}`} aria-pressed={needsActionOnly} onClick={() => setNeedsActionOnly((value) => !value)}>Perlu perhatian <span>{summary.needs_action}</span></button>
          <button type="button" className={`filter-toggle ${overdueOnly ? "active" : ""}`} aria-pressed={overdueOnly} onClick={() => setOverdueOnly((value) => !value)}>Terlambat <span>{summary.overdue}</span></button>
        </div>
      </section>

      <section className="task-summary-grid" aria-label="Ringkasan Task">
        <SummaryCard label="Perlu perhatian" value={summary.needs_action} tone="attention" />
        <SummaryCard label="Baru" value={summary.new} />
        <SummaryCard label="Sedang ditangani" value={summary.in_progress} />
        <SummaryCard label="Menunggu PIC teknis" value={summary.waiting_pic} tone="warning" />
        <SummaryCard label="Terlambat" value={summary.overdue} tone="danger" />
        <SummaryCard label="Selesai" value={summary.done} tone="success" />
      </section>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState label="Memuat Task Monitoring…" /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="Belum ada Task" description="Task yang masuk ke scope Anda akan tampil di sini. Gunakan filter Project atau status bila diperlukan." /> : null}
      {!loading && rows.length > 0 ? (
        <div className="task-monitoring-groups">
          {groupedRows.map((group) => (
            <section className="panel task-monitoring-group" key={group.name}>
              <div className="panel-heading-row">
                <div><span className="eyebrow">Project</span><h3 className="panel-title">{group.name}</h3></div>
                <span className="muted">{group.rows.length} Task</span>
              </div>
              <div className="task-list-header" aria-hidden="true"><span>Task</span><span>Status</span><span>Penanggung jawab</span><span>Deadline</span></div>
              <div className="task-monitoring-list">
                {group.rows.map((row) => <TaskRow key={row.id} row={row} technicalView={technicalView} onOpen={() => setSelected(row)} />)}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {selected ? <TaskDetailPanel row={selected} technicalView={technicalView} canOverride={user.role === "superadmin" || user.role === "bos_it"} onClose={() => setSelected(null)} onUpdated={(row) => { setSelected(row); setRows((current) => current.map((item) => item.id === row.id ? row : item)); }} /> : null}
      {!loading && !error && rows.length > 0 && hasMore ? <div className="task-load-more"><button type="button" className="btn btn-neutral" disabled={loadingMore} onClick={() => setPage((current) => current + 1)}>{loadingMore ? "Memuat…" : "Muat Task berikutnya"}</button></div> : null}
      {createOpen ? <CreateTaskModal filters={filters} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setPage(1); setRefreshNonce((value) => value + 1); }} /> : null}
    </AppShell>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className={`task-summary-card ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function TaskRow({ row, technicalView, onOpen }: { row: TaskMonitoringRow; technicalView: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`task-monitoring-row ${row.is_overdue ? "overdue" : ""}`} onClick={onOpen}>
      <div className="task-monitoring-main">
        <div className="task-monitoring-title-line"><strong>{row.title}</strong>{row.source === "legacy_task" ? <span className="legacy-task-label">Pekerjaan Lama</span> : null}</div>
        <span className="muted">{row.website ? `${row.website.name} · ${row.website.domain}` : "General / tanpa Website"}</span>
        {row.summary ? <span className="task-monitoring-summary">{row.summary}</span> : null}
      </div>
      <div className="task-monitoring-context"><span className={`task-business-status ${row.status}`}>{STATUS_LABELS[row.status]}</span><span className={`priority-tag ${row.priority}`}>{PRIORITY_LABELS[row.priority]}</span>{row.is_overdue ? <span className="overdue-label">Terlambat</span> : null}</div>
      <div className="task-monitoring-assignees">{row.pic_developer ? <span className="task-monitoring-person"><span className="member-avatar">{initials(row.pic_developer.name)}</span>{row.pic_developer.name}</span> : <span className="muted">Belum ada PIC teknis</span>}{technicalView && row.developers.length > 0 ? <span className="muted">{row.developers.length} developer</span> : null}</div>
      <div className="task-monitoring-due">{row.due_date ? <span className={row.is_overdue ? "text-danger" : "muted"}>{formatDateTime(row.due_date)}</span> : <span className="muted">Tanpa deadline</span>}{technicalView ? <span className="muted">{row.story_count ? `${row.story_count} User Story` : "Belum ada User Story"}</span> : <span className="muted">{row.story_count ? "Sedang ditangani tim teknis" : "Belum diturunkan ke tim teknis"}</span>}</div>
    </button>
  );
}

function TaskDetailPanel({ row, technicalView, canOverride, onClose, onUpdated }: { row: TaskMonitoringRow; technicalView: boolean; canOverride: boolean; onClose: () => void; onUpdated: (row: TaskMonitoringRow) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function updateStatus(status: string) {
    setSaving(true); setError("");
    try { onUpdated(await taskMonitoringApi.updateStatus(row.source_id, status || null)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memperbarui status Task"); }
    finally { setSaving(false); }
  }
  return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="task-detail-drawer" role="dialog" aria-modal="true" aria-label={`Detail Task ${row.title}`} onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">Detail Task</span><h2>{row.title}</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup detail">×</button></div>{error ? <ErrorBanner message={error} /> : null}<div className="task-detail-badges"><span className={`task-business-status ${row.status}`}>{STATUS_LABELS[row.status]}</span><span className={`priority-tag ${row.priority}`}>{PRIORITY_LABELS[row.priority]}</span>{row.is_overdue ? <span className="overdue-label">Terlambat</span> : null}</div><dl className="task-detail-facts"><div><dt>Project</dt><dd>{row.project?.name ?? "General / tanpa Project"}</dd></div><div><dt>Website</dt><dd>{row.website ? <Link href={`/websites/${row.website.id}`}>{row.website.name}</Link> : "—"}</dd></div><div><dt>PIC teknis</dt><dd>{row.pic_developer?.name ?? "Belum ada — perlu ditetapkan oleh Bos IT"}</dd></div><div><dt>Deadline</dt><dd>{row.due_date ? formatDateTime(row.due_date) : "Belum ditentukan"}</dd></div></dl><section className="task-detail-section"><span className="eyebrow">Ringkasan bisnis</span><p>{row.business?.problem || row.summary || "Tidak ada ringkasan."}</p>{row.business?.expectation ? <><span className="eyebrow">Hasil yang diharapkan</span><p>{row.business.expectation}</p></> : null}</section>{technicalView ? <section className="task-detail-section"><div className="panel-heading-row"><div><span className="eyebrow">Technical breakdown</span><h3 className="panel-title">User Stories</h3></div><span className="muted">{row.story_count}</span></div>{row.stories.length === 0 ? <p className="muted">Belum ada User Story. PIC Developer dapat memecah Task ini menjadi pekerjaan teknis.</p> : <div className="task-detail-stories">{row.stories.map((story) => <div className="task-detail-story" key={story.id}><strong>{story.title}</strong><span className={`story-status-label ${story.status}`}>{story.status.replace(/_/g, " ")}</span><span className="muted">{story.primary_developer?.name ?? "Belum ada developer utama"}{story.collaborators.length ? ` · ${story.collaborators.length} collaborator` : ""}</span></div>)}</div>}</section> : <section className="task-detail-section"><span className="eyebrow">Progress teknis</span><p className="muted">{row.story_count ? "Sedang ditangani tim teknis." : "Belum diturunkan ke tim teknis."}</p></section>}{canOverride && row.source === "task" ? <section className="task-detail-actions"><span className="eyebrow">Kontrol status bisnis</span><p className="muted">Override hanya digunakan untuk kondisi bisnis khusus. Progress teknis tetap menjadi sumber status otomatis.</p><Select value={row.status} onChange={(value) => void updateStatus(value)} options={[{ value: "", label: "Kembali ke status otomatis" }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]} disabled={saving} aria-label="Status bisnis Task" /></section> : null}</aside></div>;
}

function CreateTaskModal({ filters, onClose, onCreated }: { filters: TaskMonitoringFilters; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", scope: "website" as TaskScope, project_id: "", website_id: "", category: "website" as TaskCategory, description: "", expectation: "", priority: "medium" as Severity });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const websites = filters.websites.filter((website) => !form.project_id || website.project_id === form.project_id);
  const scopeOptions = [
    { value: "project", label: "Seluruh Project" },
    { value: "website", label: "Website tertentu" },
    ...(form.category === "website" ? [] : [{ value: "general", label: "General / tanpa Project" }]),
  ];

  function changeScope(value: string) {
    const scope = value as TaskScope;
    setForm((current) => ({
      ...current,
      scope,
      project_id: scope === "general" ? "" : current.project_id,
      website_id: scope === "website" ? current.website_id : "",
    }));
    setError("");
  }

  function changeCategory(value: string) {
    const category = value as TaskCategory;
    setForm((current) => ({
      ...current,
      category,
      scope: category === "website" && current.scope === "general" ? "website" : category === "website" && current.scope === "project" ? "website" : current.scope,
      website_id: category === "website" && current.scope === "project" ? "" : current.website_id,
    }));
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    if (form.scope === "general" && form.category === "website") {
      setError("Task kategori Website harus ditujukan ke Website tertentu.");
      setSaving(false);
      return;
    }
    if (form.scope !== "general" && !form.project_id) {
      setError("Pilih Project untuk menentukan ruang kerja Task.");
      setSaving(false);
      return;
    }
    if (form.scope === "website" && !form.website_id) {
      setError("Pilih Website yang menjadi sumber masalah atau kebutuhan.");
      setSaving(false);
      return;
    }
    try { await taskIntakeApi.create({ title: form.title, project_id: form.scope === "general" ? undefined : form.project_id || undefined, website_id: form.scope === "website" ? form.website_id || undefined : undefined, category: form.category, description: form.description, expectation: form.expectation, priority: form.priority }); onCreated(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Gagal membuat Task"); }
    finally { setSaving(false); }
  }
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="modal task-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title" onClick={(event) => event.stopPropagation()}><div className="drawer-kicker">Intake pekerjaan</div><h2 id="create-task-title">Buat Task</h2><p className="muted">Masukkan kebutuhan dari sisi bisnis. Developer tidak dipilih di form ini; bila Task terkait Project, PIC teknis Project yang menindaklanjuti.</p>{error ? <ErrorBanner message={error} /> : null}<form onSubmit={submit}><div className="form-field"><label htmlFor="task-title">Judul Task</label><input id="task-title" className="text-input" required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Contoh: Perbaiki form kontak" /></div><div className="form-grid task-scope-grid"><div className="form-field"><label htmlFor="task-scope">Task ini untuk</label><Select id="task-scope" value={form.scope} onChange={changeScope} options={scopeOptions} /><p className="task-scope-help muted">Pilih Website tertentu untuk masalah spesifik, atau seluruh Project untuk kebutuhan bersama.</p></div>{form.scope !== "general" ? <div className="form-field"><label htmlFor="task-project">Project</label><Select id="task-project" value={form.project_id} onChange={(value) => setForm((current) => ({ ...current, project_id: value, website_id: "" }))} options={[{ value: "", label: "Pilih Project" }, ...filters.projects.map((project) => ({ value: project.id, label: project.name }))]} /></div> : null}{form.scope === "website" ? <div className="form-field"><label htmlFor="task-website">Website</label><Select id="task-website" value={form.website_id} onChange={(value) => setForm((current) => ({ ...current, website_id: value }))} options={[{ value: "", label: "Pilih Website" }, ...websites.map((website) => ({ value: website.id, label: website.name }))]} disabled={!form.project_id} /><p className="task-scope-help muted">{form.project_id ? "Website ini otomatis tetap berada di Project yang dipilih." : "Pilih Project terlebih dahulu."}</p></div> : null}<div className="form-field"><label htmlFor="task-category">Kategori</label><Select id="task-category" value={form.category} onChange={changeCategory} options={[{ value: "website", label: "Website" }, { value: "help_desk", label: "Help Desk" }, { value: "procurement", label: "Procurement" }]} /></div><div className="form-field"><label htmlFor="task-priority">Priority</label><Select id="task-priority" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: value as Severity }))} options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} /></div></div><div className="form-field"><label htmlFor="task-description">Masalah / kebutuhan</label><textarea id="task-description" className="text-input" rows={4} required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div><div className="form-field"><label htmlFor="task-expectation">Hasil yang diharapkan</label><textarea id="task-expectation" className="text-input" rows={3} required value={form.expectation} onChange={(event) => setForm((current) => ({ ...current, expectation: event.target.value }))} /></div><div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Buat Task"}</button></div></form></div></div>;
}
