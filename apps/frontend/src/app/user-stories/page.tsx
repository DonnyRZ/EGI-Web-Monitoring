"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { userStoriesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canViewUserStories, formatDateTime, initials } from "@/lib/format";
import type { UserStory } from "@/lib/types";
import { useRouter } from "next/navigation";

const COLUMNS = ["backlog", "ready", "in_progress", "review", "done", "blocked"];
const LABELS: Record<string, string> = { backlog: "Backlog", ready: "Ready", in_progress: "In Progress", review: "Review", done: "Done", blocked: "Blocked" };

export default function UserStoriesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<UserStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const response = await userStoriesApi.list({ limit: 100, status: status || undefined, priority: priority || undefined, search: search || undefined }); setItems(response.data); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memuat User Stories"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (!authLoading && user && !canViewUserStories(user.role)) router.replace("/dashboard"); }, [authLoading, user, router]);
  useEffect(() => { if (user && canViewUserStories(user.role)) void load(); }, [user, status, priority]);

  const title = user?.role === "developer" ? "User Stories Saya" : "User Stories";
  const filtered = useMemo(() => search.trim() ? items.filter((story) => `${story.title} ${story.project?.name || ""} ${story.website?.name || ""}`.toLowerCase().includes(search.trim().toLowerCase())) : items, [items, search]);

  if (!user || !canViewUserStories(user.role)) return <AppShell title="User Stories"><LoadingState /></AppShell>;

  return <AppShell title={title}><section className="project-page-intro"><div><span className="eyebrow">Delivery workspace</span><h2>{title}</h2><p className="muted">Backlog, assignment, acceptance criteria, review, dan blocker dalam satu alur kerja.</p></div></section><section className="project-toolbar panel"><input className="text-input project-search" placeholder="Cari judul, Project, atau Website…" value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={status} onChange={setStatus} options={[{ value: "", label: "Semua status" }, ...COLUMNS.map((value) => ({ value, label: LABELS[value] }))]} aria-label="Filter status" /><Select value={priority} onChange={setPriority} options={[{ value: "", label: "Semua priority" }, ...["critical", "high", "medium", "low"].map((value) => ({ value, label: value }))]} aria-label="Filter priority" /><div className="segmented-control"><button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button></div></section>{error ? <ErrorBanner message={error} /> : null}{loading ? <LoadingState label="Memuat User Stories…" /> : null}{!loading && filtered.length === 0 ? <EmptyState title="Belum ada User Story" description={user.role === "developer" ? "Story yang ditugaskan kepada Anda akan muncul di sini." : "Buat story dari halaman detail Project."} /> : null}{!loading && filtered.length > 0 ? view === "board" ? <div className="story-board standalone-story-board">{COLUMNS.map((column) => <div key={column} className="story-column"><div className="story-column-header"><span>{LABELS[column]}</span><strong>{filtered.filter((story) => story.status === column).length}</strong></div><div className="story-column-cards">{filtered.filter((story) => story.status === column).map((story) => <GlobalStoryCard key={story.id} story={story} onUpdated={load} />)}</div></div>)}</div> : <div className="story-list standalone-story-list">{filtered.map((story) => <GlobalStoryCard key={story.id} story={story} onUpdated={load} list />)}</div> : null}</AppShell>;
}

function GlobalStoryCard({ story, onUpdated, list = false }: { story: UserStory; onUpdated: () => Promise<void>; list?: boolean }) {
  const [saving, setSaving] = useState(false);
  const statusOptions = [...new Set([story.status, "in_progress", "review", "done", "blocked"])]
  async function update(status: string) { setSaving(true); try { await userStoriesApi.update(story.id, { status }); await onUpdated(); } catch { /* preserve the list if a scoped update is rejected */ } finally { setSaving(false); } }
  return <article className={`story-card ${list ? "compact" : ""} ${story.is_overdue ? "overdue" : ""}`}><div className="story-card-top"><span className={`story-priority ${story.priority}`}>{story.priority}</span>{story.is_overdue ? <span className="overdue-label">Overdue</span> : null}</div><Link href={`/projects/${story.project_id}`}><h4>{story.title}</h4></Link><div className="story-card-context"><span>{story.project?.name || "Project"}</span>{story.website ? <span>{story.website.name}</span> : null}{story.tickets.length ? <span>{story.tickets.length} tiket</span> : null}</div><div className="story-card-assignees">{story.primary_developer ? <span className="story-assignee"><span className="member-avatar">{initials(story.primary_developer.name)}</span>{story.primary_developer.name}</span> : <span className="muted">Belum ada developer utama</span>}</div>{list ? <div className="story-list-meta"><span className={`story-status-label ${story.status}`}>{LABELS[story.status]}</span><span className="muted">{story.due_date ? `Deadline ${formatDateTime(story.due_date)}` : "Tanpa deadline"}</span></div> : null}<Select value={story.status} onChange={(value) => void update(value)} options={statusOptions.map((value) => ({ value, label: LABELS[value] }))} disabled={saving} aria-label={`Status ${story.title}`} /></article>;
}
