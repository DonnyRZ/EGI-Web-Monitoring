"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { tasksApi, websitesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import {
  canViewTasks,
  clipText,
  formatDateTime,
  taskStatusLabel,
} from "@/lib/format";
import type { Task, TaskStatus, Website } from "@/lib/types";

function isOverdue(task: Task) {
  if (task.status === "done") return false;
  const deadline = new Date(task.sla_deadline).getTime();
  return Number.isFinite(deadline) && deadline < Date.now();
}

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const [items, setItems] = useState<Task[]>([]);
  const [websites, setWebsites] = useState<Record<string, Website>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && !canViewTasks(user.role)) {
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
    if (!user || !canViewTasks(user.role)) return;
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

  if (!user || !canViewTasks(user.role)) {
    return (
      <AppShell title={isSuperadmin ? "Task Monitoring" : "To-Do List"}>
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell title={isSuperadmin ? "Task Monitoring" : "To-Do List"}>
      <div className="page-toolbar">
        <p className="page-toolbar-desc muted">
          {isSuperadmin
            ? "Pantau progress task, SLA, dan status pekerjaan developer."
            : "Tugas yang didelegasikan oleh Superadmin. Perbarui status saat Anda mulai atau menyelesaikan pekerjaan."}
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
                <th>Catatan instruksi</th>
                <th>SLA</th>
                <th>Status</th>
                {!isSuperadmin ? <th>Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((task) => {
                const site = websites[task.website_id];
                const busy = updatingId === task.id;
                const overdue = isOverdue(task);
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
                    <td style={{ maxWidth: 360 }}>
                      <span title={task.instruction_notes}>
                        {clipText(task.instruction_notes, 160)}
                      </span>
                    </td>
                    <td>
                      <span className={overdue ? "task-sla-overdue" : undefined}>
                        {formatDateTime(task.sla_deadline)}
                      </span>
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
                    {!isSuperadmin ? (
                      <td>
                        <div className="row-actions">
                        {task.status === "pending" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={busy}
                            onClick={() => void updateStatus(task.id, "in_progress")}
                          >
                            {busy ? "…" : "Mulai Kerjakan"}
                          </button>
                        ) : null}
                        {task.status === "in_progress" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={busy}
                            onClick={() => void updateStatus(task.id, "done")}
                          >
                            {busy ? "…" : "Selesai"}
                          </button>
                        ) : null}
                        {task.status === "done" ? (
                          <span className="muted" style={{ fontSize: "0.85rem" }}>
                            Selesai
                          </span>
                        ) : null}
                        </div>
                      </td>
                    ) : null}
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
