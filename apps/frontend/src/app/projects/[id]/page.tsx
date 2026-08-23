"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AssignmentWorkspace } from "@/components/projects/AssignmentWorkspace";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState, SuccessBanner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { projectsApi, taskIntakeApi, ticketsApi, userStoriesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canManageProjects, canViewProjectRegistry, formatDateTime, initials } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import type {
  Project,
  ProjectStatus,
  Ticket,
  UserStory,
} from "@/lib/types";

type ProjectTab = "overview" | "websites" | "assignments" | "tasks" | "stories";
type StoryView = "list" | "board";

const STATUS_LABELS: Record<ProjectStatus, string> = { draft: "Draft", active: "Aktif", archived: "Archived" };
const STATUS_HELP: Record<ProjectStatus, { title: string; description: string }> = {
  draft: { title: "Draft", description: "Project masih disiapkan dan boleh belum memiliki Website." },
  active: { title: "Aktif", description: "Project sedang berjalan dan wajib memiliki minimal satu Website." },
  archived: { title: "Archived", description: "Project disimpan sebagai arsip; data historis tetap dipertahankan." },
};
const STORY_STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};
const STORY_COLUMNS = ["backlog", "ready", "in_progress", "review", "done", "blocked"];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ProjectTab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [websiteOpen, setWebsiteOpen] = useState(false);
  const [ticketList, setTicketList] = useState<Ticket[]>([]);
  const [stories, setStories] = useState<UserStory[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [storyView, setStoryView] = useState<StoryView>("board");
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyFromTicket, setStoryFromTicket] = useState<Ticket | null>(null);
  const [ticketComposerOpen, setTicketComposerOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const canAdmin = Boolean(user && canManageProjects(user.role));
  const technicalView = user?.role === "bos_it" || user?.role === "developer";
  const canManageStories = Boolean(
    user && project && (user.role === "bos_it" || (user.role === "developer" && project.pic_developer_id === user.id)),
  );
  const canCreateProjectTicket = Boolean(
    user && project && (canAdmin || user.role === "pic_web"),
  );

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      setProject(await projectsApi.get(projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat Project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!authLoading && user && !canViewProjectRegistry(user.role)) router.replace("/dashboard");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) void loadProject();
  }, [user, loadProject]);

  const loadStories = useCallback(async () => {
    if (!projectId) return;
    setStoriesLoading(true);
    try {
      const response = await userStoriesApi.listForProject(projectId, { limit: 100 });
      setStories(response.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat User Stories");
    } finally {
      setStoriesLoading(false);
    }
  }, [projectId]);

  const loadTickets = useCallback(async () => {
    if (!projectId) return;
    setTicketsLoading(true);
    try {
      const response = await ticketsApi.list({ project_id: projectId, limit: 100 });
      setTicketList(response.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat Tasks Project");
    } finally {
      setTicketsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === "stories") void loadStories();
    if (tab === "tasks") void loadTickets();
  }, [tab, loadStories, loadTickets]);

  if (authLoading || loading) return <AppShell title="Project"><LoadingState label="Memuat Project…" /></AppShell>;
  if (!user || !canViewProjectRegistry(user.role)) return <AppShell title="Project"><LoadingState /></AppShell>;
  if (!project) return <AppShell title="Project"><ErrorBanner message={error || "Project tidak ditemukan"} /><Link href="/projects" className="btn">Kembali ke Project</Link></AppShell>;

  const title = canAdmin ? "Kelola Project" : "Project Saya";
  const tabs: Array<{ id: ProjectTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "websites", label: "Websites & Monitoring" },
    ...(canAdmin ? [{ id: "assignments" as const, label: "PIC & Assignment" }] : []),
    { id: "tasks", label: "Tasks" },
    ...(user.role === "bos_it" || user.role === "developer" ? [{ id: "stories" as const, label: "User Stories" }] : []),
  ];

  function refreshAfterMutation(nextProject: Project) {
    setProject(nextProject);
    setNotice("");
  }

  return (
    <AppShell title={title}>
      <div className="project-detail-header">
        <div className="breadcrumb"><Link href="/projects">Project</Link><span>/</span><span>{project.name}</span></div>
        <div className="project-detail-title-row">
          <div>
            <div className="project-title-line"><h2>{project.name}</h2><span className={`project-status-pill ${project.status}`}>{STATUS_LABELS[project.status]}</span></div>
            <p className="muted project-description">{project.description || "Belum ada deskripsi Project."}</p>
          </div>
          <div className="project-header-actions">
            {canAdmin ? <button type="button" className="btn btn-neutral" onClick={() => setEditOpen(true)}>Pengaturan Project</button> : null}
            {canAdmin ? <button type="button" className="btn btn-primary" onClick={() => setWebsiteOpen(true)}>Tambah Website</button> : null}
          </div>
        </div>
        <div className="project-summary-strip">
          <SummaryMetric label="Website" value={String(project.websites_count)} detail={`${project.active_websites_count} aktif`} />
          <SummaryMetric label="Health" value={healthSummaryLabel(project.health_summary.status)} tone={project.health_summary.status} detail={`${project.health_summary.down} down · ${project.health_summary.warning} warning`} />
          <SummaryMetric label="Task aktif" value={String(project.active_tickets_count)} detail={`${project.untriaged_tickets_count} belum ditriase`} />
          {technicalView ? <SummaryMetric label="Pekerjaan teknis aktif" value={String(project.active_stories_count)} tone={project.overdue_count ? "down" : undefined} detail={project.overdue_count ? `${project.overdue_count} overdue` : "Tidak ada overdue"} /> : <SummaryMetric label="Task perlu perhatian" value={String(project.overdue_count)} tone={project.overdue_count ? "down" : undefined} detail={project.overdue_count ? "Perlu ditindaklanjuti" : "Tidak ada overdue"} />}
        </div>
      </div>

      <nav className="project-tabs" aria-label="Navigasi Project">
        {tabs.map((item) => <button key={item.id} type="button" className={`project-tab ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>{item.label}{item.id === "tasks" && project.active_tickets_count > 0 ? <span className="tab-count">{project.active_tickets_count}</span> : null}{item.id === "stories" && project.active_stories_count > 0 ? <span className="tab-count">{project.active_stories_count}</span> : null}</button>)}
      </nav>

      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <SuccessBanner message={notice} /> : null}

      {tab === "overview" ? <OverviewTab project={project} onOpenTab={setTab} showAssignments={canAdmin} showStories={technicalView} /> : null}
      {tab === "websites" ? <WebsitesTab project={project} canAdmin={canAdmin} onChange={refreshAfterMutation} onAdd={() => setWebsiteOpen(true)} /> : null}
      {tab === "assignments" && canAdmin ? <AssignmentWorkspace project={project} onSaved={(next, message) => { refreshAfterMutation(next); setNotice(message); }} /> : null}
      {tab === "tasks" ? <TicketsTab tickets={ticketList} loading={ticketsLoading} technicalView={technicalView} canManageStories={canManageStories} canCreateTicket={canCreateProjectTicket} onCreateTicket={() => setTicketComposerOpen(true)} onCreateStory={(ticket) => { setStoryFromTicket(ticket); setStoryComposerOpen(true); }} /> : null}
      {tab === "stories" ? <StoriesTab project={project} stories={stories} loading={storiesLoading} canManage={canManageStories} view={storyView} onViewChange={setStoryView} onRefresh={loadStories} onCreate={() => { setStoryFromTicket(null); setStoryComposerOpen(true); }} /> : null}

      {editOpen ? <EditProjectModal project={project} onClose={() => setEditOpen(false)} onSaved={(next) => { refreshAfterMutation(next); setEditOpen(false); }} /> : null}
      {websiteOpen ? <AddWebsiteModal projectId={project.id} onClose={() => setWebsiteOpen(false)} onSaved={(next) => { refreshAfterMutation(next); setWebsiteOpen(false); }} /> : null}
      {storyComposerOpen ? <StoryComposer project={project} ticket={storyFromTicket} onClose={() => setStoryComposerOpen(false)} onSaved={() => { setStoryComposerOpen(false); setNotice("User Story berhasil dibuat."); void loadStories(); void loadProject(); }} /> : null}
      {ticketComposerOpen ? <TicketComposer project={project} onClose={() => setTicketComposerOpen(false)} onSaved={() => { setTicketComposerOpen(false); setNotice("Task berhasil dibuat."); void loadTickets(); void loadProject(); }} /> : null}
    </AppShell>
  );
}

function SummaryMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="project-summary-metric"><span className="metric-label">{label}</span><strong className={tone ? `summary-value ${tone}` : "summary-value"}>{value}</strong><span className="muted">{detail}</span></div>;
}

function OverviewTab({ project, onOpenTab, showAssignments, showStories }: { project: Project; onOpenTab: (tab: ProjectTab) => void; showAssignments: boolean; showStories: boolean }) {
  return (
    <div className="project-overview-grid">
      <section className="panel project-overview-main">
        <div className="panel-heading-row"><div><span className="eyebrow">Ringkasan</span><h3 className="panel-title">Project health</h3></div><button type="button" className="text-link" onClick={() => onOpenTab("websites")}>Lihat semua website →</button></div>
        <div className="health-summary-grid">
          <HealthBox label="Sehat" count={project.health_summary.normal} tone="normal" />
          <HealthBox label="Perlu perhatian" count={project.health_summary.warning} tone="warning" />
          <HealthBox label="Down" count={project.health_summary.down} tone="down" />
          <HealthBox label="Belum ada data" count={project.health_summary.unknown} tone="unknown" />
        </div>
        <div className="overview-website-list">
          {project.websites.length === 0 ? <div className="inline-empty"><span className="project-status-pill draft">Draft</span><span>Belum ada website di Project ini.</span><button type="button" className="text-link" onClick={() => onOpenTab("websites")}>Tambahkan Website →</button></div> : project.websites.slice(0, 5).map((website) => <WebsiteMiniRow key={website.id} website={website} />)}
        </div>
      </section>
      <aside className="project-overview-side">
        <section className="panel"><div className="panel-heading-row"><h3 className="panel-title">PIC & team</h3>{showAssignments ? <button type="button" className="text-link" onClick={() => onOpenTab("assignments")}>Lihat →</button> : null}</div><TeamSummary project={project} /></section>
        <section className="panel"><div className="panel-heading-row"><h3 className="panel-title">Jalur kerja</h3><button type="button" className="text-link" onClick={() => onOpenTab(showStories ? "stories" : "tasks")}>{showStories ? "Buka User Stories →" : "Buka Tasks →"}</button></div><div className="workflow-mini"><WorkflowStep label="Task aktif" value={String(project.active_tickets_count)} />{showStories ? <WorkflowStep label="Pekerjaan teknis aktif" value={String(project.active_stories_count)} /> : null}<WorkflowStep label="Overdue" value={String(project.overdue_count)} danger={project.overdue_count > 0} /></div></section>
      </aside>
    </div>
  );
}

function HealthBox({ label, count, tone }: { label: string; count: number; tone: string }) {
  return <div className={`health-box ${tone}`}><span className="project-health-dot" /><strong>{count}</strong><span>{label}</span></div>;
}

function WebsiteMiniRow({ website }: { website: Project["websites"][number] }) {
  const latest = (website as typeof website & { latest_result?: { status?: string } | null }).latest_result;
  const status = latest?.status ?? "unknown";
  return <div className="website-mini-row"><span className={`project-health-dot ${status}`} /><div><strong>{website.name}</strong><span className="muted">{website.domain}</span></div><span className={`project-health ${status}`}><span className="project-health-dot" />{healthSummaryLabel(status)}</span></div>;
}

function TeamSummary({ project }: { project: Project }) {
  return <div className="team-summary"><TeamRow label="PIC Web" members={project.pic_web} empty="Belum ditentukan" /><TeamRow label="PIC Developer" members={project.pic_developer ? [project.pic_developer] : []} empty="Opsional / belum ditentukan" /><TeamRow label="Developer team" members={project.developers} empty="Belum ada team" /></div>;
}

function TeamRow({ label, members, empty }: { label: string; members: Array<{ id: string; name: string }>; empty: string }) {
  return <div className="team-row"><span className="muted">{label}</span>{members.length ? <div className="team-member-list">{members.slice(0, 4).map((member) => <span key={member.id} className="team-member-chip"><span className="member-avatar">{initials(member.name)}</span>{member.name}</span>)}{members.length > 4 ? <span className="muted">+{members.length - 4}</span> : null}</div> : <span className="muted">{empty}</span>}</div>;
}

function WorkflowStep({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="workflow-step"><span>{label}</span><strong className={danger ? "text-danger" : ""}>{value}</strong></div>;
}

function WebsitesTab({ project, canAdmin, onChange, onAdd }: { project: Project; canAdmin: boolean; onChange: (project: Project) => void; onAdd: () => void }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function remove(websiteId: string, name: string) {
    if (!confirm(`Lepas ${name} dari Project? Histori monitoring tetap aman.`)) return;
    setRemoving(websiteId); setError("");
    try { onChange(await projectsApi.removeWebsite(project.id, websiteId)); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal melepas Website"); } finally { setRemoving(null); }
  }
  return <section className="panel"><div className="panel-heading-row"><div><span className="eyebrow">Monitoring source</span><h3 className="panel-title">Websites dalam Project</h3><p className="muted">Website tetap menjadi sumber data monitoring; health di sini merupakan gabungan seluruh website.</p></div>{canAdmin ? <button type="button" className="btn btn-primary" onClick={onAdd}>Tambah Website</button> : null}</div>{error ? <ErrorBanner message={error} /> : null}{project.websites.length === 0 ? <EmptyState title="Draft — belum ada website" description="Tambahkan website untuk mulai menghubungkan monitoring ke Project ini." /> : <div className="website-detail-list">{project.websites.map((website) => { const latest = (website as typeof website & { latest_result?: { status?: string; checkedAt?: string } | null }).latest_result; const status = latest?.status ?? "unknown"; return <div key={website.id} className="website-detail-row"><div className="website-detail-identity"><span className={`project-health-dot ${status}`} /><div><strong>{website.name}</strong><span className="muted">{website.domain}</span><span className="website-url">{website.url}</span></div></div><div className="website-detail-health"><span className={`project-health ${status}`}><span className="project-health-dot" />{healthSummaryLabel(status)}</span>{latest?.checkedAt ? <span className="muted">Cek {formatDateTime(latest.checkedAt)}</span> : <span className="muted">Belum ada hasil monitoring</span>}</div><div className="row-actions"><Link href={`/websites/${website.id}`} className="btn btn-sm btn-neutral">Detail monitoring</Link>{canAdmin ? <button type="button" className="btn btn-sm btn-neutral" disabled={removing === website.id} onClick={() => void remove(website.id, website.name)}>{removing === website.id ? "…" : "Lepas"}</button> : null}</div></div>; })}</div>}</section>;
}

function TicketsTab({ tickets, loading, technicalView, canManageStories, canCreateTicket, onCreateTicket, onCreateStory }: { tickets: Ticket[]; loading: boolean; technicalView: boolean; canManageStories: boolean; canCreateTicket: boolean; onCreateTicket: () => void; onCreateStory: (ticket: Ticket) => void }) {
  if (loading) return <LoadingState label="Memuat Tasks Project…" />;
  return <section className="panel"><div className="panel-heading-row"><div><span className="eyebrow">Intake</span><h3 className="panel-title">Tasks Project</h3><p className="muted">{technicalView ? "Task adalah permintaan bisnis. PIC Developer memecah Task yang membutuhkan coding menjadi pekerjaan teknis." : "Pantau status, deadline, dan tindak lanjut Task Project ini."}</p></div>{canCreateTicket ? <button type="button" className="btn btn-primary" onClick={onCreateTicket}>Buat Task</button> : null}</div>{tickets.length === 0 ? <EmptyState title="Belum ada Task" description="Task yang terhubung dengan Project ini akan muncul di sini." /> : <div className="ticket-project-list">{tickets.map((ticket) => <div key={ticket.id} className="ticket-project-row"><div><div className="ticket-title-line"><strong>{ticket.title}</strong><span className={`ticket-status-badge ${ticket.status}`}>{ticket.status.replace(/_/g, " ")}</span></div><p>{ticket.description || "Tidak ada deskripsi."}</p><span className="muted">Dibuat {formatDateTime(ticket.created_at)}{ticket.sla_deadline ? ` · SLA ${formatDateTime(ticket.sla_deadline)}` : ""}</span></div><div className="row-actions">{technicalView && ticket.user_story_count > 0 ? <><span className="linked-story-label">{ticket.user_story_count} User Story</span>{canManageStories ? <button type="button" className="btn btn-sm btn-neutral" onClick={() => onCreateStory(ticket)}>Pecah lagi</button> : null}</> : technicalView && canManageStories ? <button type="button" className="btn btn-sm btn-primary" onClick={() => onCreateStory(ticket)}>Buat User Story</button> : <span className="muted">{technicalView ? "Menunggu triase" : ticket.user_story_count > 0 ? "Sedang ditangani tim teknis" : "Menunggu tindak lanjut"}</span>}</div></div>)}</div>}</section>;
}

function StoriesTab({ project, stories, loading, canManage, view, onViewChange, onRefresh, onCreate }: { project: Project; stories: UserStory[]; loading: boolean; canManage: boolean; view: StoryView; onViewChange: (view: StoryView) => void; onRefresh: () => Promise<void>; onCreate: () => void }) {
  const [statusFilter, setStatusFilter] = useState("");
  const filtered = statusFilter ? stories.filter((story) => story.status === statusFilter) : stories;
  return <section className="panel"><div className="panel-heading-row"><div><span className="eyebrow">Unit kerja teknis</span><h3 className="panel-title">User Stories</h3><p className="muted">Story menggabungkan konteks Task, acceptance criteria, dan assignment developer.</p></div><div className="row-actions">{canManage ? <button type="button" className="btn btn-primary" onClick={onCreate}>Tambah User Story</button> : null}<div className="segmented-control"><button type="button" className={view === "board" ? "active" : ""} onClick={() => onViewChange("board")}>Board</button><button type="button" className={view === "list" ? "active" : ""} onClick={() => onViewChange("list")}>List</button></div></div></div><div className="story-filter-row"><Select value={statusFilter} onChange={setStatusFilter} options={[{ value: "", label: "Semua status" }, ...STORY_COLUMNS.map((status) => ({ value: status, label: STORY_STATUS_LABELS[status] }))]} aria-label="Filter status User Story" /></div>{loading ? <LoadingState label="Memuat User Stories…" /> : filtered.length === 0 ? <EmptyState title="Belum ada User Story" description={canManage ? "Buat story baru atau pecah Task yang membutuhkan pekerjaan teknis." : "Story yang ditugaskan kepada Anda akan muncul di sini."} /> : view === "board" ? <StoryBoard stories={filtered} canManage={canManage} onRefresh={onRefresh} /> : <StoryList stories={filtered} canManage={canManage} onRefresh={onRefresh} />}</section>;
}

function StoryBoard({ stories, canManage, onRefresh }: { stories: UserStory[]; canManage: boolean; onRefresh: () => Promise<void> }) { return <div className="story-board">{STORY_COLUMNS.map((status) => <div key={status} className="story-column"><div className="story-column-header"><span>{STORY_STATUS_LABELS[status]}</span><strong>{stories.filter((story) => story.status === status).length}</strong></div><div className="story-column-cards">{stories.filter((story) => story.status === status).map((story) => <StoryCard key={story.id} story={story} canManage={canManage} onRefresh={onRefresh} />)}</div></div>)}</div>; }

function StoryList({ stories, canManage, onRefresh }: { stories: UserStory[]; canManage: boolean; onRefresh: () => Promise<void> }) { return <div className="story-list">{stories.map((story) => <StoryCard key={story.id} story={story} canManage={canManage} onRefresh={onRefresh} compact />)}</div>; }

function StoryCard({ story, canManage, onRefresh, compact = false }: { story: UserStory; canManage: boolean; onRefresh: () => Promise<void>; compact?: boolean }) { const [saving, setSaving] = useState(false); const statusOptions = canManage ? STORY_COLUMNS : [...new Set([story.status, "in_progress", "review", "done", "blocked"])]; async function statusChange(status: string) { setSaving(true); try { await userStoriesApi.update(story.id, { status }); await onRefresh(); } catch { /* page refresh keeps the error surface simple */ } finally { setSaving(false); } } return <article className={`story-card ${compact ? "compact" : ""} ${story.is_overdue ? "overdue" : ""}`}><div className="story-card-top"><span className={`story-priority ${story.priority}`}>{story.priority}</span>{story.is_overdue ? <span className="overdue-label">Overdue</span> : null}</div><h4>{story.title}</h4><div className="story-card-context">{story.website ? <span>{story.website.name}</span> : null}{story.tickets.length ? <span>{story.tickets.length} tiket</span> : null}</div><div className="story-card-assignees">{story.primary_developer ? <span className="story-assignee"><span className="member-avatar">{initials(story.primary_developer.name)}</span>{story.primary_developer.name}</span> : <span className="muted">Belum ada developer utama</span>}</div>{compact ? <div className="story-status-select"><Select value={story.status} onChange={(value) => void statusChange(value)} options={statusOptions.map((status) => ({ value: status, label: STORY_STATUS_LABELS[status] }))} disabled={saving} aria-label={`Status ${story.title}`} /></div> : <div className="story-card-footer"><span className={`story-status-label ${story.status}`}>{STORY_STATUS_LABELS[story.status]}</span>{canManage ? <Select value={story.status} onChange={(value) => void statusChange(value)} options={STORY_COLUMNS.map((status) => ({ value: status, label: STORY_STATUS_LABELS[status] }))} disabled={saving} aria-label={`Status ${story.title}`} /> : null}</div>}</article>; }

function WorkTab({ project, stories, loading, canManage, onOpenStories }: { project: Project; stories: UserStory[]; loading: boolean; canManage: boolean; onOpenStories: () => void }) { const open = stories.filter((story) => story.status !== "done"); return <section className="work-monitoring"><div className="work-monitoring-header"><div><span className="eyebrow">Task Monitoring</span><h3>Work Monitoring Project</h3><p className="muted">{canManage ? "Detail pekerjaan, blocker, deadline, dan assignment developer." : "Ringkasan pekerjaan Project yang berkaitan dengan tanggung jawab Anda."}</p></div>{canManage ? <button type="button" className="btn btn-neutral" onClick={onOpenStories}>Buka User Stories</button> : null}</div><div className="work-summary-grid"><SummaryMetric label="Pending" value={String(open.filter((story) => story.status === "backlog" || story.status === "ready").length)} detail="Backlog + Ready" /><SummaryMetric label="In progress" value={String(open.filter((story) => story.status === "in_progress" || story.status === "review").length)} detail="Sedang dikerjakan" /><SummaryMetric label="Blocked" value={String(open.filter((story) => story.status === "blocked").length)} detail="Butuh perhatian" tone={open.some((story) => story.status === "blocked") ? "down" : undefined} /><SummaryMetric label="Overdue" value={String(open.filter((story) => story.is_overdue).length)} detail="Melewati deadline" tone={open.some((story) => story.is_overdue) ? "down" : undefined} /></div>{loading ? <LoadingState /> : open.length === 0 ? <EmptyState title="Tidak ada pekerjaan aktif" description="Project ini belum memiliki User Story aktif." /> : <div className="work-detail-list">{open.map((story) => <div key={story.id} className="work-detail-row"><div><strong>{story.title}</strong><span className="muted">{story.primary_developer?.name || "Belum ditugaskan"}{story.due_date ? ` · Deadline ${formatDateTime(story.due_date)}` : " · Tanpa deadline"}</span></div><div className="work-detail-right"><span className={`story-status-label ${story.status}`}>{STORY_STATUS_LABELS[story.status]}</span>{story.is_overdue ? <span className="overdue-label">Overdue</span> : null}</div></div>)}</div>}</section>; }

function EditProjectModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: (project: Project) => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [archiveConfirmed, setArchiveConfirmed] = useState(project.status === "archived");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = name !== project.name || description !== (project.description || "") || status !== project.status;
  useUnsavedChanges(`projects:${project.id}:edit`, dirty);
  const activeWorkCount = project.active_tickets_count + project.active_stories_count;
  const activeWorkLabel = [
    project.active_tickets_count ? `${project.active_tickets_count} Task aktif` : "",
    project.active_stories_count ? `${project.active_stories_count} User Story aktif` : "",
  ].filter(Boolean).join(" dan ");
  const statusHelp = STATUS_HELP[status];
  const archiveNeedsConfirmation = status === "archived" && project.status !== "archived" && !archiveConfirmed;

  const requestClose = useCallback(() => {
    if (!dirty || saving || window.confirm("Perubahan belum disimpan. Tutup Pengaturan Project?")) onClose();
  }, [dirty, onClose, saving]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  function handleStatusChange(value: string) {
    const next = value as ProjectStatus;
    setStatus(next);
    setArchiveConfirmed(next === "archived" && project.status === "archived");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "active" && project.websites_count === 0) {
      setError("Tambahkan minimal satu Website sebelum mengaktifkan Project.");
      return;
    }
    if (archiveNeedsConfirmation) {
      setError("Konfirmasikan pengarsipan Project terlebih dahulu.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await projectsApi.update(project.id, { name, description: description || null, status }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan Pengaturan Project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={requestClose}>
      <div className="modal project-create-drawer project-settings-modal" role="dialog" aria-modal="true" aria-labelledby="project-settings-title" aria-describedby="project-settings-description" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-kicker">Project settings</div>
        <h2 id="project-settings-title">Pengaturan Project</h2>
        <p id="project-settings-description" className="muted project-settings-description">Kelola identitas dan lifecycle Project. Website serta PIC & Assignment diatur pada tab masing-masing.</p>
        {error ? <ErrorBanner message={error} /> : null}
        <form onSubmit={submit}>
          <fieldset className="project-settings-section">
            <legend>Informasi Project</legend>
            <p className="project-settings-section-help">Informasi ini membantu tim mengenali tujuan dan ruang lingkup Project.</p>
            <div className="form-field">
              <label htmlFor="edit-project-name">Nama Project</label>
              <input id="edit-project-name" className="text-input" required maxLength={150} autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="edit-project-desc">Deskripsi <span className="muted">(opsional)</span></label>
              <textarea id="edit-project-desc" className="text-input" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tujuan, batasan, atau konteks Project…" />
            </div>
          </fieldset>

          <fieldset className="project-settings-section">
            <legend>Status Project</legend>
            <p className="project-settings-section-help">Status menunjukkan lifecycle Project, bukan status kesehatan Website.</p>
            <div className="form-field">
              <label htmlFor="edit-project-status">Status</label>
              <Select id="edit-project-status" value={status} onChange={handleStatusChange} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
              <p className="status-help"><strong>{statusHelp.title}.</strong> {statusHelp.description}</p>
            </div>
            {status === "active" && project.websites_count === 0 ? <div className="warning-banner" role="alert">Project aktif wajib memiliki minimal satu Website. Tambahkan Website terlebih dahulu melalui tab Websites & Monitoring.</div> : null}
            {status === "archived" && project.status !== "archived" ? <div className="project-status-confirmation" role="alert"><strong>Konfirmasi pengarsipan</strong><p>Project akan ditandai sebagai Archived dan tidak muncul sebagai Project aktif. Data, Website, Task, dan User Story tidak dihapus.</p>{activeWorkCount > 0 ? <p className="text-danger">Masih ada {activeWorkLabel}. Pastikan pekerjaan ini memang boleh dilanjutkan tanpa Project aktif.</p> : null}<div className="row-actions"><button type="button" className="btn btn-sm" onClick={() => { setStatus(project.status); setArchiveConfirmed(project.status === "archived"); }}>Kembali</button><button type="button" className="btn btn-sm btn-danger" onClick={() => setArchiveConfirmed(true)}>Ya, arsipkan Project</button></div></div> : null}
            {status === "archived" && project.status === "archived" && activeWorkCount > 0 ? <div className="warning-banner" role="alert">Project Archived masih memiliki {activeWorkLabel}. Histori tetap aman, tetapi pekerjaan aktif perlu ditinjau.</div> : null}
            {status === "archived" && project.active_websites_count > 0 ? <div className="warning-banner" role="alert">Archived tidak otomatis menghentikan monitoring Website. Nonaktifkan Website pada tab Websites & Monitoring bila monitoring memang harus dihentikan.</div> : null}
          </fieldset>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={requestClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving || archiveNeedsConfirmation}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddWebsiteModal({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: (project: Project) => void }) { const [form, setForm] = useState({ name: "", domain: "", url: "" }); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const dirty = Boolean(form.name || form.domain || form.url); useUnsavedChanges(`projects:${projectId}:website`, dirty); async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { onSaved(await projectsApi.addWebsite(projectId, form)); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal menambahkan Website"); } finally { setSaving(false); } } return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="modal project-create-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="drawer-kicker">Monitoring source</div><h2>Tambah Website</h2><p className="muted">Website langsung ditempatkan di Project ini. Histori monitoring existing tetap menggunakan Website ID-nya.</p>{error ? <ErrorBanner message={error} /> : null}<form onSubmit={submit}><div className="form-field"><label htmlFor="website-name">Nama Website</label><input id="website-name" className="text-input" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div><div className="form-field"><label htmlFor="website-domain">Domain</label><input id="website-domain" className="text-input" required value={form.domain} onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))} placeholder="example.com" /></div><div className="form-field"><label htmlFor="website-url">URL</label><input id="website-url" className="text-input" type="url" required value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.com" /></div><div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menambahkan…" : "Tambahkan Website"}</button></div></form></div></div>; }

function TicketComposer({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const initialWebsiteId = project.websites[0]?.id || "";
  const [form, setForm] = useState({ title: "", website_id: initialWebsiteId, category: "website" as "website" | "help_desk" | "procurement", description: "", expectation: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = Boolean(form.title || form.description || form.expectation || form.category !== "website" || form.website_id !== initialWebsiteId);
  useUnsavedChanges(`projects:${project.id}:task`, dirty);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    if (form.category === "website" && !form.website_id) {
      setError("Pilih Website untuk Task berkategori Website.");
      setSaving(false);
      return;
    }
    try { await taskIntakeApi.create({ ...form, project_id: project.id, website_id: form.website_id || undefined }); onSaved(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Gagal membuat Task"); }
    finally { setSaving(false); }
  }
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="modal project-create-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="drawer-kicker">Project intake</div><h2>Buat Task</h2><p className="muted">Task masuk sebagai intake. PIC Developer dapat memecahnya menjadi User Story bila membutuhkan coding.</p>{error ? <ErrorBanner message={error} /> : null}<form onSubmit={submit}><div className="form-field"><label htmlFor="ticket-title">Judul</label><input id="ticket-title" className="text-input" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div><div className="story-form-grid"><div className="form-field"><label htmlFor="ticket-website">Website <span className="muted">(opsional untuk help desk/procurement)</span></label><Select id="ticket-website" value={form.website_id} onChange={(value) => setForm((current) => ({ ...current, website_id: value }))} options={[{ value: "", label: "Tanpa Website" }, ...project.websites.map((website) => ({ value: website.id, label: website.name }))]} /></div><div className="form-field"><label htmlFor="ticket-category">Kategori</label><Select id="ticket-category" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value as typeof current.category }))} options={[{ value: "website", label: "Website" }, { value: "help_desk", label: "Help Desk" }, { value: "procurement", label: "Procurement" }]} /></div></div><div className="form-field"><label htmlFor="ticket-description">Masalah / kebutuhan</label><textarea id="ticket-description" className="text-input" rows={5} required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div><div className="form-field"><label htmlFor="ticket-expectation">Hasil yang diharapkan</label><textarea id="ticket-expectation" className="text-input" rows={4} required value={form.expectation} onChange={(event) => setForm((current) => ({ ...current, expectation: event.target.value }))} /></div><div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Buat Task"}</button></div></form></div></div>;
}

function StoryComposer({ project, ticket, onClose, onSaved }: { project: Project; ticket: Ticket | null; onClose: () => void; onSaved: () => void }) { const initialTitle = ticket?.title || ""; const initialDescription = ticket?.description || ""; const initialAcceptanceCriteria = ticket?.expectation || ""; const initialWebsiteId = ticket?.website_id || ""; const [form, setForm] = useState({ title: initialTitle, description: initialDescription, acceptance_criteria: initialAcceptanceCriteria, website_id: initialWebsiteId, priority: "medium", primary_developer_id: "", collaborator_ids: [] as string[], due_date: "" }); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const dirty = form.title !== initialTitle || form.description !== initialDescription || form.acceptance_criteria !== initialAcceptanceCriteria || form.website_id !== initialWebsiteId || form.priority !== "medium" || Boolean(form.primary_developer_id) || form.collaborator_ids.length > 0 || Boolean(form.due_date); useUnsavedChanges(`projects:${project.id}:story`, dirty); function toggleCollaborator(id: string) { setForm((current) => ({ ...current, collaborator_ids: current.collaborator_ids.includes(id) ? current.collaborator_ids.filter((value) => value !== id) : [...current.collaborator_ids, id] })); } async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { const body = { ...form, website_id: form.website_id || null, primary_developer_id: form.primary_developer_id || null, due_date: form.due_date ? new Date(form.due_date).toISOString() : null }; if (ticket) await userStoriesApi.createFromTicket(ticket.id, body); else await userStoriesApi.create(project.id, body); onSaved(); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal menyimpan User Story"); } finally { setSaving(false); } } return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="modal story-composer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="drawer-kicker">{ticket ? "Pecah Task" : "Project work"}</div><h2>{ticket ? "Buat User Story dari Task" : "Tambah User Story"}</h2>{ticket ? <p className="muted">Task akan ditautkan ke User Story ini. Task yang sama dapat memiliki beberapa User Story.</p> : null}{error ? <ErrorBanner message={error} /> : null}<form onSubmit={submit}><div className="form-field"><label htmlFor="story-title">Judul</label><input id="story-title" className="text-input" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div><div className="story-form-grid"><div className="form-field"><label htmlFor="story-website">Website <span className="muted">(opsional)</span></label><Select id="story-website" value={form.website_id} onChange={(value) => setForm((current) => ({ ...current, website_id: value }))} options={[{ value: "", label: "Seluruh Project" }, ...project.websites.map((website) => ({ value: website.id, label: website.name }))]} /></div><div className="form-field"><label htmlFor="story-priority">Priority</label><Select id="story-priority" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: value }))} options={["critical", "high", "medium", "low"].map((value) => ({ value, label: value }))} /></div><div className="form-field"><label htmlFor="story-primary">Primary developer</label><Select id="story-primary" value={form.primary_developer_id} onChange={(value) => setForm((current) => ({ ...current, primary_developer_id: value }))} options={[{ value: "", label: "Belum ditentukan" }, ...project.developers.map((developer) => ({ value: developer.id, label: developer.name }))]} /></div><div className="form-field"><label htmlFor="story-due">Deadline <span className="muted">(opsional)</span></label><input id="story-due" className="text-input" type="datetime-local" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} /></div></div><div className="form-field"><label htmlFor="story-description">Deskripsi</label><textarea id="story-description" className="text-input" rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div><div className="form-field"><label htmlFor="story-acceptance">Acceptance criteria</label><textarea id="story-acceptance" className="text-input" rows={4} value={form.acceptance_criteria} onChange={(event) => setForm((current) => ({ ...current, acceptance_criteria: event.target.value }))} /></div><div className="form-field"><span className="form-label">Collaborator</span><div className="story-collaborator-grid">{project.developers.map((developer) => <label key={developer.id} className="collaborator-option"><input type="checkbox" checked={form.collaborator_ids.includes(developer.id)} onChange={() => toggleCollaborator(developer.id)} />{developer.name}</label>)}</div></div><div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan User Story"}</button></div></form></div></div>; }

function healthSummaryLabel(status?: string | null) { if (status === "normal") return "Sehat"; if (status === "warning") return "Warning"; if (status === "down") return "Down"; return "Unknown"; }
