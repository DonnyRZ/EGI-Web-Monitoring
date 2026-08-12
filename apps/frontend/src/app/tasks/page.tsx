"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AddPersonalTaskModal } from "@/components/AddPersonalTaskModal";
import { AppShell } from "@/components/AppShell";
import { IconPlus } from "@/components/icons";
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

type TaskTab = "all" | "pending" | "in_progress" | "overdue";

const TAB_LABELS: Record<TaskTab, string> = {
  all: "Semua",
  pending: "Pending",
  in_progress: "Dikerjakan",
  overdue: "Overdue",
};

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
  const [tab, setTab] = useState<TaskTab>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);

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

  const pendingCount = items.filter((t) => t.status === "pending").length;
  const inProgressCount = items.filter((t) => t.status === "in_progress").length;
  const overdueCount = items.filter((t) => isOverdue(t)).length;

  const filteredItems = items.filter((task) => {
    if (tab === "pending") return task.status === "pending";
    if (tab === "in_progress") return task.status === "in_progress";
    if (tab === "overdue") return isOverdue(task);
    return true;
  });

  const emptyTabCopy: Record<TaskTab, { title: string; description: string }> = {
    all: {
      title: "Belum ada tugas",
      description: "Tugas yang ditugaskan ke Anda akan muncul di sini.",
    },
    pending: {
      title: "Tidak ada tugas pending",
      description: "Semua tugas sudah mulai dikerjakan atau selesai.",
    },
    in_progress: {
      title: "Tidak ada yang sedang dikerjakan",
      description: "Belum ada tugas yang berstatus dikerjakan.",
    },
    overdue: {
      title: "Tidak ada yang lewat deadline",
      description: "Semua tugas masih dalam batas SLA. Kerja bagus!",
    },
  };

  return (
    <AppShell title={isReadOnlyViewer ? "Task Monitoring" : "To-Do List"}>
      <div className="page-toolbar">
        <p className="page-toolbar-desc muted">
          {isReadOnlyViewer
            ? "Pantau progress task, SLA, dan status pekerjaan developer — baik dari tiket PIC Web, delegasi Superadmin, maupun to-do manual."
            : "Tugas dari tiket PIC Web dan delegasi Superadmin. Deadline boleh kosong sampai Bos IT mengisinya — tetap boleh dikerjakan."}
        </p>
      </div>

      {!loading && items.length > 0 ? (
        <div className="metrics-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className="metric">
            <div className="metric-label">Pending</div>
            <div className="metric-value">{pendingCount}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Dikerjakan</div>
            <div className="metric-value">{inProgressCount}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Overdue</div>
            <div className="metric-value" style={overdueCount > 0 ? { color: "var(--danger)" } : undefined}>
              {overdueCount}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && (items.length > 0 || !isReadOnlyViewer) ? (
        <div className="page-tabs">
          <div className="page-tabs-list" role="tablist" aria-label="Filter tugas">
            {items.length > 0
              ? (Object.keys(TAB_LABELS) as TaskTab[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`page-tab ${tab === key ? "active" : ""}`}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                  >
                    {TAB_LABELS[key]}
                    {key === "overdue" && overdueCount > 0 ? ` (${overdueCount})` : ""}
                  </button>
                ))
              : null}
          </div>
          {!isReadOnlyViewer ? (
            <button
              type="button"
              className="page-tabs-add"
              onClick={() => setAddModalOpen(true)}
              aria-label="Tambah To-Do"
              title="Tambah To-Do"
            >
              <IconPlus />
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="Belum ada tugas"
          description="Tugas yang ditugaskan ke Anda akan muncul di sini."
        />
      ) : null}

      {!loading && items.length > 0 && filteredItems.length === 0 ? (
        <EmptyState
          title={emptyTabCopy[tab].title}
          description={emptyTabCopy[tab].description}
        />
      ) : null}

      {!loading && filteredItems.length > 0 ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Website</th>
                <th>Task</th>
                <th>SLA</th>
                <th>Status</th>
                <th>{isReadOnlyViewer ? "Lampiran" : "Aksi"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((task) => {
                const site = websites[task.website_id];
                const busy = updatingId === task.id;
                const overdue = isOverdue(task);
                const sourceTag = task.ticket_id
                  ? { cls: "ticket", label: "Tiket PIC" }
                  : task.created_by_id && task.created_by_id === task.assignee_id
                    ? { cls: "manual", label: "Manual" }
                    : { cls: "delegation", label: "Delegasi" };
                return (
                  <tr key={task.id} className={overdue ? "task-row-overdue" : undefined}>
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
                      <div>
                        <span className={`task-source-tag ${sourceTag.cls}`}>{sourceTag.label}</span>
                      </div>
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      {task.ticket_id ? (
                        <ul className="task-points">
                          {task.problem ? (
                            <li title={task.problem}>{clipText(task.problem, 140)}</li>
                          ) : null}
                          {task.expectation ? (
                            <li title={task.expectation}>{clipText(task.expectation, 140)}</li>
                          ) : null}
                          {!task.problem && !task.expectation ? (
                            <span className="muted">-</span>
                          ) : null}
                        </ul>
                      ) : (
                        <div title={task.instruction_notes}>
                          {clipText(task.instruction_notes, 180)}
                        </div>
                      )}
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

      {addModalOpen && user ? (
        <AddPersonalTaskModal
          websites={Object.values(websites)}
          currentUserId={user.id}
          onClose={() => setAddModalOpen(false)}
          onCreated={(task) => {
            setItems((prev) => [task, ...prev]);
            setAddModalOpen(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}
