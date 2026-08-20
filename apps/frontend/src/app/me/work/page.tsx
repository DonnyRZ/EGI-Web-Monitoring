"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { legacyTasksApi, userStoriesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, initials, taskStatusLabel } from "@/lib/format";
import type { MyWorkResponse, TaskStatus } from "@/lib/types";
import { useRouter } from "next/navigation";

const STORY_STATUS_LABELS: Record<string, string> = { backlog: "Backlog", ready: "Ready", in_progress: "In Progress", review: "Review", done: "Done", blocked: "Blocked" };

export default function MyWorkPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [work, setWork] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() { setLoading(true); setError(""); try { setWork(await userStoriesApi.meWork()); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memuat My Work"); } finally { setLoading(false); } }
  useEffect(() => { if (!authLoading && user && user.role !== "developer") router.replace("/tasks"); }, [authLoading, user, router]);
  useEffect(() => { if (user?.role === "developer") void load(); }, [user]);

  async function updateStory(id: string, status: string) { setUpdating(id); try { await userStoriesApi.update(id, { status }); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memperbarui story"); } finally { setUpdating(null); } }
  async function updateTask(id: string, status: TaskStatus) { setUpdating(id); try { await legacyTasksApi.updateStatus(id, status); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memperbarui legacy task"); } finally { setUpdating(null); } }

  if (!user || user.role !== "developer") return <AppShell title="My Work"><LoadingState /></AppShell>;
  return <AppShell title="My Work"><section className="project-page-intro"><div><span className="eyebrow">Personal delivery</span><p className="muted">User Story adalah pekerjaan utama. Legacy Task ditampilkan terpisah agar histori tetap terbaca.</p></div></section>{error ? <ErrorBanner message={error} /> : null}{loading || !work ? <LoadingState label="Memuat pekerjaan Anda…" /> : <><div className="work-summary-grid"><Summary label="Pending" value={work.summary.pending} detail="Backlog + Ready" /><Summary label="In progress" value={work.summary.in_progress} detail="Story aktif" /><Summary label="Overdue" value={work.summary.overdue} detail="Story + legacy task" danger={work.summary.overdue > 0} /><Summary label="Done" value={work.summary.done} detail="Story selesai" /></div><section className="my-work-section"><div className="panel-heading-row"><div><span className="eyebrow">Canonical work</span><h3 className="panel-title">User Stories</h3></div><span className="muted">{work.stories.length} story</span></div>{work.stories.length === 0 ? <EmptyState title="Belum ada User Story" description="Story yang Anda pegang sebagai primary developer atau collaborator akan muncul di sini." /> : <div className="my-work-story-list">{work.stories.map((story) => <div key={story.id} className={`my-work-story ${story.is_overdue ? "overdue" : ""}`}><div className="my-work-story-main"><Link href={`/projects/${story.project_id}`} className="list-title">{story.title}</Link><span className="muted">{story.project?.name || "Project"}{story.website ? ` · ${story.website.name}` : ""}</span><span className="story-card-assignee"><span className="member-avatar">{initials(story.primary_developer?.name || user.name)}</span>{story.primary_developer?.name || "Belum ada primary developer"}{story.collaborators.length ? ` · ${story.collaborators.length} collaborator` : ""}</span></div><div className="my-work-story-meta"><span className={`story-status-label ${story.status}`}>{STORY_STATUS_LABELS[story.status]}</span>{story.due_date ? <span className={story.is_overdue ? "text-danger" : "muted"}>{story.is_overdue ? "Overdue · " : "Deadline "}{formatDateTime(story.due_date)}</span> : <span className="muted">Tanpa deadline</span>}<Select value={story.status} onChange={(value) => void updateStory(story.id, value)} options={Object.entries(STORY_STATUS_LABELS).map(([value, label]) => ({ value, label }))} disabled={updating === story.id} aria-label={`Status ${story.title}`} /></div></div>)}</div>}</section><section className="my-work-section"><div className="panel-heading-row"><div><span className="eyebrow">Compatibility view</span><h3 className="panel-title">Legacy Tasks</h3></div><span className="legacy-task-label">Legacy Task</span></div>{work.legacy_tasks.length === 0 ? <EmptyState title="Tidak ada legacy task" description="Task lama yang masih relevan akan tetap muncul di sini." /> : <div className="legacy-task-list">{work.legacy_tasks.map((task) => <div key={task.id} className="legacy-task-row"><div><span className="legacy-task-label">Legacy Task</span><strong>{task.instruction_notes}</strong><span className="muted">{task.sla_deadline ? `Deadline ${formatDateTime(task.sla_deadline)}` : "Tanpa deadline"}</span></div><div className="row-actions"><span className={`badge-soft task-status-${task.status}`}>{taskStatusLabel(task.status)}</span>{task.status === "pending" ? <button type="button" className="btn btn-sm btn-primary" disabled={updating === task.id} onClick={() => void updateTask(task.id, "in_progress")}>Mulai</button> : null}{task.status === "in_progress" ? <button type="button" className="btn btn-sm btn-primary" disabled={updating === task.id} onClick={() => void updateTask(task.id, "done")}>Selesai</button> : null}</div></div>)}</div>}</section></>}</AppShell>;
}

function Summary({ label, value, detail, danger }: { label: string; value: number; detail: string; danger?: boolean }) { return <div className="project-summary-metric"><span className="metric-label">{label}</span><strong className={danger ? "summary-value down" : "summary-value"}>{value}</strong><span className="muted">{detail}</span></div>; }
