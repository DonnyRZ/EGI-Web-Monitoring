"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { workloadApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canViewDeveloperWorkload } from "@/lib/format";
import type { DeveloperWorkload } from "@/lib/types";

export default function TeamWorkloadPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<DeveloperWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && user && !canViewDeveloperWorkload(user.role)) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  const loadWorkload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await workloadApi.developers();
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat beban kerja developer");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !canViewDeveloperWorkload(user.role)) return;
    void loadWorkload();
  }, [user, loadWorkload]);

  if (!user || !canViewDeveloperWorkload(user.role)) {
    return (
      <AppShell title="Developer">
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell title="Developer">
      <div className="page-toolbar">
        <p className="page-toolbar-desc muted">
          Ringkasan beban kerja tiap developer: tiket PIC Web dan task yang masih aktif, serta yang sudah lewat deadline.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="Belum ada developer"
          description="Belum ada user dengan role developer yang aktif."
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Developer</th>
                <th>Tiket Open</th>
                <th>Tiket In Progress</th>
                <th>Tiket Overdue</th>
                <th>Task Pending</th>
                <th>Task In Progress</th>
                <th>Task Overdue</th>
                <th>Total Aktif</th>
              </tr>
            </thead>
            <tbody>
              {items.map((dev) => {
                const overdue = dev.tickets_overdue + dev.tasks_overdue;
                return (
                  <tr key={dev.developer_id}>
                    <td>{dev.developer_name}</td>
                    <td>{dev.tickets_open}</td>
                    <td>{dev.tickets_in_progress}</td>
                    <td>
                      <span className={dev.tickets_overdue > 0 ? "task-sla-overdue" : undefined}>
                        {dev.tickets_overdue}
                      </span>
                    </td>
                    <td>{dev.tasks_pending}</td>
                    <td>{dev.tasks_in_progress}</td>
                    <td>
                      <span className={dev.tasks_overdue > 0 ? "task-sla-overdue" : undefined}>
                        {dev.tasks_overdue}
                      </span>
                    </td>
                    <td>
                      <strong className={overdue > 0 ? "task-sla-overdue" : undefined}>
                        {dev.total_active}
                      </strong>
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
