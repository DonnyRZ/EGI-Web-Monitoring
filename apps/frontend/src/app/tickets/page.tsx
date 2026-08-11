"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ticketsApi, websitesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import {
  clipText,
  isoToLocalInput,
  localInputToIso,
  ticketStatusLabel,
} from "@/lib/format";
import type { Ticket, Website } from "@/lib/types";

function isOverdue(ticket: Ticket) {
  if (ticket.status === "resolved" || ticket.status === "closed" || !ticket.sla_deadline) return false;
  const deadline = new Date(ticket.sla_deadline).getTime();
  return Number.isFinite(deadline) && deadline < Date.now();
}

function canAccess(role?: string | null) {
  return role === "superadmin" || role === "bos_it";
}

export default function TicketsInboxPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Ticket[]>([]);
  const [websites, setWebsites] = useState<Record<string, Website>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [slaDrafts, setSlaDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authLoading || !user) return;
    if (user.role === "developer") {
      router.replace("/tasks");
      return;
    }
    if (!canAccess(user.role)) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  const loadTickets = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const [ticketRes, websitesRes] = await Promise.all([
        ticketsApi.list({ limit: 100 }),
        websitesApi.list({ limit: 100 }).catch(() => ({ data: [] as Website[] })),
      ]);
      setItems(ticketRes.data);
      setWebsites(Object.fromEntries(websitesRes.data.map((w) => [w.id, w])));
      setSlaDrafts(
        Object.fromEntries(ticketRes.data.map((t) => [t.id, isoToLocalInput(t.sla_deadline)])),
      );
      if (opts?.quiet) setError("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Gagal memuat tiket";
      if (opts?.quiet) setActionError(message);
      else setError(message);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !canAccess(user.role)) return;
    void loadTickets();
  }, [user, loadTickets]);

  async function updateTicket(ticketId: string, body: { sla_deadline?: string }) {
    setActionError("");
    setUpdatingId(ticketId);
    try {
      const updated = await ticketsApi.update(ticketId, body);
      setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (updated.sla_deadline) {
        setSlaDrafts((prev) => ({ ...prev, [ticketId]: isoToLocalInput(updated.sla_deadline) }));
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal memperbarui tiket");
      await loadTickets({ quiet: true });
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

  if (!user || !canAccess(user.role)) {
    return (
      <AppShell title="Tiket">
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell title="Tiket">
      <div className="page-toolbar">
        <p className="page-toolbar-desc muted">
          Pantau tiket PIC Web. Isi deadline kapan sempat — tiket sudah masuk ke to-do developer secara otomatis
          begitu dibuat, tanpa perlu acc dulu. Status di sini ikut berubah saat developer mengerjakan/menyelesaikan
          task-nya.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Belum ada tiket" description="Tiket dari PIC Web akan muncul di sini." />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Website</th>
                <th>Masalah</th>
                <th>Ekspektasi</th>
                <th>Developer</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Lampiran</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ticket) => {
                const site = ticket.website_id ? websites[ticket.website_id] : null;
                const busy = updatingId === ticket.id;
                const overdue = isOverdue(ticket);
                return (
                  <tr key={ticket.id}>
                    <td>
                      {site ? (
                        <Link href={`/websites/${ticket.website_id}`} className="list-title">
                          {site.name}
                        </Link>
                      ) : (
                        <span className="muted">{ticket.title}</span>
                      )}
                      {site ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {site.domain}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 220 }} title={ticket.description ?? undefined}>
                      {clipText(ticket.description ?? ticket.title, 120)}
                    </td>
                    <td style={{ maxWidth: 220 }} title={ticket.expectation ?? undefined}>
                      {ticket.expectation ? clipText(ticket.expectation, 120) : <span className="muted">-</span>}
                    </td>
                    <td>{ticket.assigned_to_name || <span className="muted">Belum ada developer</span>}</td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
                        <input
                          type="datetime-local"
                          className="text-input"
                          value={slaDrafts[ticket.id] ?? ""}
                          onChange={(e) =>
                            setSlaDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                          }
                          style={{ minWidth: 190 }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-neutral"
                          disabled={busy || !slaDrafts[ticket.id]}
                          onClick={() => {
                            const iso = localInputToIso(slaDrafts[ticket.id] ?? "");
                            if (iso) void updateTicket(ticket.id, { sla_deadline: iso });
                          }}
                        >
                          {busy ? "…" : "Simpan"}
                        </button>
                      </div>
                      {overdue ? (
                        <div className="muted" style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                          Lewat deadline
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge-soft task-status-${ticket.status}`}>
                        {ticketStatusLabel(ticket.status)}
                      </span>
                    </td>
                    <td>
                      {ticket.attachment_url ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-neutral"
                          onClick={() => void openAttachment(ticket.id)}
                        >
                          Lampiran
                        </button>
                      ) : (
                        <span className="muted">-</span>
                      )}
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
