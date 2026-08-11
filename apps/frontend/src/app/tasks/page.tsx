"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { tasksApi, ticketsApi, websitesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import {
  canViewTasks,
  clipText,
  formatDateTime,
  taskStatusLabel,
} from "@/lib/format";
import type { Task, TaskStatus, Website } from "@/lib/types";

function isOverdue(task: Task) {
  if (task.status === "done" || !task.sla_deadline) return false;
  const deadline = new Date(task.sla_deadline).getTime();
  return Number.isFinite(deadline) && deadline < Date.now();
}

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isReadOnlyViewer = user?.role === "superadmin" || user?.role === "bos_it";
  const [items, setItems] = useState<Task[]>([]);
  const [websites, setWebsites] = useState<Record<string, Website>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && (!canViewTasks(user.role) || user.role === "pic_web")) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  const loadTasks = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const [tasksRes, websitesRes] = await Promise.all([
        tasksApi.list({ limit: 100 }),
        websitesApi.list({ limit: 100 }).catch(() => ({ data: [] as Website[] })),
      ]);
      setItems(tasksRes.data);
      setWebsites(Object.fromEntries(websitesRes.data.map((w) => [w.id, w])));
      if (opts?.quiet) setError("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Gagal memuat daftar tugas";
      if (opts?.quiet) setActionError(message);
      else setError(message);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !canViewTasks(user.role) || user.role === "pic_web") return;
    void loadTasks();
  }, [user, loadTasks]);

  async function updateStatus(taskId: string, status: TaskStatus) {
    setActionError("");
    setUpdatingId(taskId);
    try {
      const updated = await tasksApi.updateStatus(taskId, status);
      setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal memperbarui status tugas");
      await loadTasks({ quiet: true });
    } finally {
      setUpdatingId(null);
    }
  }

  async function openAttachment(ticketId: string) {
    setActionError("");
    try {
      const signed = await ticketsApi.attachment(ticketId);
      window.open(signed.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal membuka lampiran");
    }
  }

  if (!user || !canViewTasks(user.role) || user.role === "pic_web") {
    return (
      <AppShell title={isReadOnlyViewer ? "Task Monitoring" : "To-Do List"}>
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell title={isReadOnlyViewer ? "Task Monitoring" : "To-Do List"}>
      <div className="page-toolbar">
        <p className="page-toolbar-desc muted">
          {isReadOnlyViewer
            ? "Pantau progress task, SLA, dan status pekerjaan developer — baik dari tiket PIC Web maupun delegasi Superadmin."
            : "Tugas dari tiket PIC Web dan delegasi Superadmin. Deadline boleh kosong sampai Bos IT mengisinya — tetap boleh dikerjakan."}
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="Belum ada tugas"
          description="Tugas yang ditugaskan ke Anda akan muncul di sini."
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Website</th>
                <th>Masalah</th>
                <th>Ekspektasi</th>
                <th>SLA</th>
                <th>Status</th>
                <th>{isReadOnlyViewer ? "Lampiran" : "Aksi"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => {
                const site = websites[task.website_id];
                const busy = updatingId === task.id;
                const overdue = isOverdue(task);
                const problem = task.ticket_id ? task.problem : task.instruction_notes;
                return (
                  <tr key={task.id}>
                    <td>
                      {site ? (
                        <Link href={`/websites/${task.website_id}`} className="list-title">
                          {site.name}
                        </Link>
                      ) : (
                        <span className="muted">{clipText(task.website_id, 12)}</span>
                      )}
                      {site ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {site.domain}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 260 }} title={problem ?? undefined}>
                      {problem ? clipText(problem, 140) : <span className="muted">-</span>}
                    </td>
                    <td style={{ maxWidth: 220 }} title={task.expectation ?? undefined}>
                      {task.expectation ? clipText(task.expectation, 140) : <span className="muted">-</span>}
                    </td>
                    <td>
                      {task.sla_deadline ? (
                        <span className={overdue ? "task-sla-overdue" : undefined}>
                          {formatDateTime(task.sla_deadline)}
                        </span>
                      ) : (
                        <span className="muted">Belum ada deadline</span>
                      )}
                      {overdue ? (
                        <div className="muted" style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                          Lewat SLA
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge-soft task-status-${task.status}`}>
                        {taskStatusLabel(task.status)}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {task.ticket_id && task.ticket_attachment_url ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-neutral"
                            onClick={() => void openAttachment(task.ticket_id as string)}
                          >
                            Lampiran
                          </button>
                        ) : null}
                        {!isReadOnlyViewer && task.status === "pending" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={busy}
                            onClick={() => void updateStatus(task.id, "in_progress")}
                          >
                            {busy ? "…" : "Mulai Kerjakan"}
                          </button>
                        ) : null}
                        {!isReadOnlyViewer && task.status === "in_progress" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={busy}
                            onClick={() => void updateStatus(task.id, "done")}
                          >
                            {busy ? "…" : "Selesai"}
                          </button>
                        ) : null}
                        {!isReadOnlyViewer && task.status === "done" ? (
                          <span className="muted" style={{ fontSize: "0.85rem" }}>
                            Selesai
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </AppShell>
  );
}
