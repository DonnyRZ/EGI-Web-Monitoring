"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UserStoryDetailModal } from "@/components/user-stories/UserStoryDetailModal";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { legacyTasksApi, userStoriesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, initials, taskStatusLabel } from "@/lib/format";
import { getUserStoryStatusGroup, USER_STORY_STATUS_GROUP_LABELS } from "@/lib/user-story-status";
import type { MyWorkResponse, TaskStatus, UserStory } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function MyWorkPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [work, setWork] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null);

  async function load() { setLoading(true); setError(""); try { setWork(await userStoriesApi.meWork()); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memuat My Work"); } finally { setLoading(false); } }
  useEffect(() => { if (!authLoading && user && user.role !== "developer") router.replace("/tasks"); }, [authLoading, user, router]);
  useEffect(() => { if (user?.role === "developer") void load(); }, [user]);

  async function updateTask(id: string, status: TaskStatus) { setUpdating(id); try { await legacyTasksApi.updateStatus(id, status); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memperbarui tugas"); } finally { setUpdating(null); } }

  async function refreshAfterStoryUpdate(updated: UserStory) {
    setSelectedStory(updated);
    await load();
  }

  if (!user || user.role !== "developer") return <AppShell title="My Work"><LoadingState /></AppShell>;
  return <AppShell title="My Work"><section className="project-page-intro"><div><span className="eyebrow">Personal delivery</span><p className="muted">User Story adalah pekerjaan utama. Tugas yang masih relevan tetap ditampilkan agar tidak terlewat.</p></div></section>{error ? <ErrorBanner message={error} /> : null}{loading || !work ? <LoadingState label="Memuat pekerjaan Anda…" /> : <><div className="work-summary-grid"><Summary label="Belum mulai" value={work.summary.pending} /><Summary label="Berjalan" value={work.summary.in_progress} detail="Story aktif" /><Summary label="Terlambat" value={work.summary.overdue} detail="Story + tugas" danger={work.summary.overdue > 0} /><Summary label="Selesai" value={work.summary.done} detail="Story selesai" /></div><section className="my-work-section"><div className="panel-heading-row"><div><span className="eyebrow">Pekerjaan utama</span><h3 className="panel-title">User Stories</h3></div><span className="muted">{work.stories.length} story</span></div>{work.stories.length === 0 ? <EmptyState title="Belum ada User Story" description="Story yang menjadi tanggung jawab Anda akan muncul di sini." /> : <div className="my-work-story-list">{work.stories.map((story) => { const statusGroup = getUserStoryStatusGroup(story.status); return <div key={story.id} className={`my-work-story ${story.is_overdue ? "overdue" : ""}`}><div className="my-work-story-main"><Link href={`/projects/${story.project_id}`} className="list-title">{story.title}</Link><span className="muted">{story.project?.name || "Project"}{story.website ? ` · ${story.website.name}` : ""}</span><span className="story-card-assignee"><span className="member-avatar">{initials(story.primary_developer?.name || user.name)}</span>{story.primary_developer?.name || "Belum ada developer utama"}{story.collaborators.length ? ` · ${story.collaborators.length} pendamping` : ""}</span></div><div className="my-work-story-meta"><span className={`story-status-label story-status-group ${statusGroup}`}>{USER_STORY_STATUS_GROUP_LABELS[statusGroup]}</span>{story.due_date ? <span className={story.is_overdue ? "text-danger" : "muted"}>{story.is_overdue ? "Terlambat · " : "Deadline "}{formatDateTime(story.due_date)}</span> : <span className="muted">Tanpa deadline</span>}<button type="button" className="btn btn-sm btn-neutral" onClick={() => setSelectedStory(story)} aria-label={`Lihat detail User Story ${story.title}`}>Lihat detail</button></div></div>; })}</div>}</section><section className="my-work-section"><div className="panel-heading-row"><div><span className="eyebrow">Tugas lainnya</span><h3 className="panel-title">Tugas</h3></div><span className="legacy-task-label">Tugas</span></div>{work.legacy_tasks.length === 0 ? <EmptyState title="Tidak ada tugas lain" description="Tugas lain yang masih relevan akan muncul di sini." /> : <div className="legacy-task-list">{work.legacy_tasks.map((task) => <div key={task.id} className="legacy-task-row"><div><span className="legacy-task-label">Tugas</span><strong>{task.instruction_notes}</strong><span className="muted">{task.sla_deadline ? `Deadline ${formatDateTime(task.sla_deadline)}` : "Tanpa deadline"}</span></div><div className="row-actions"><span className={`badge-soft task-status-${task.status}`}>{taskStatusLabel(task.status)}</span>{task.status === "pending" ? <button type="button" className="btn btn-sm btn-primary" disabled={updating === task.id} onClick={() => void updateTask(task.id, "in_progress")}>Mulai</button> : null}{task.status === "in_progress" ? <button type="button" className="btn btn-sm btn-primary" disabled={updating === task.id} onClick={() => void updateTask(task.id, "done")}>Selesai</button> : null}</div></div>)}</div>}</section></>}<UserStoryDetailModal story={selectedStory} canEditStatus canManageStatus={false} onClose={() => setSelectedStory(null)} onSaved={refreshAfterStoryUpdate} /></AppShell>;
}

function Summary({ label, value, detail, danger }: { label: string; value: number; detail?: string; danger?: boolean }) { return <div className="project-summary-metric"><span className="metric-label">{label}</span><strong className={danger ? "summary-value down" : "summary-value"}>{value}</strong>{detail ? <span className="muted">{detail}</span> : null}</div>; }
