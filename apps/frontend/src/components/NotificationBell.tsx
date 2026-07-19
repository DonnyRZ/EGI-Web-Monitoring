"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { notificationsApi } from "@/lib/api-services";
import { formatRelative } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { IconBell } from "./icons";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ limit: 20 });
      setItems(res.data);
      setUnread(res.unread_count);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function markAll() {
    await notificationsApi.markAllRead();
    await load();
  }

  async function markOne(n: Notification) {
    if (!n.read_at) {
      await notificationsApi.markRead(n.id);
      await load();
    }
    setOpen(false);
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Notifikasi"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        <IconBell />
        {unread > 0 ? <span className="bell-dot" /> : null}
      </button>
      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Daftar notifikasi">
          <div className="notif-header">
            <strong>Notifikasi</strong>
            {unread > 0 ? (
              <button type="button" className="btn btn-ghost" style={{ height: 32 }} onClick={() => void markAll()}>
                Tandai dibaca
              </button>
            ) : null}
          </div>
          <div className="notif-list">
            {loading && items.length === 0 ? (
              <div className="notif-empty">Memuat…</div>
            ) : items.length === 0 ? (
              <div className="notif-empty">Tidak ada notifikasi</div>
            ) : (
              items.map((n) => {
                const inner = (
                  <>
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                    <span>{formatRelative(n.created_at)}</span>
                  </>
                );
                if (n.incident_id) {
                  return (
                    <Link
                      key={n.id}
                      href={`/incidents/${n.incident_id}`}
                      className={`notif-item ${n.read_at ? "" : "unread"}`}
                      onClick={() => void markOne(n)}
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-item ${n.read_at ? "" : "unread"}`}
                    onClick={() => void markOne(n)}
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
