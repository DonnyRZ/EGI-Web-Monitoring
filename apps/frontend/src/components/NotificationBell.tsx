"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notificationsApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canViewIncidents, formatRelative } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { IconBell } from "./icons";
import { useBodyScrollLock, useDialogFocus, useViewportMode } from "./ResponsiveOverlay";

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelId = "notification-panel";
  const titleId = "notification-panel-title";
  const viewportMode = useViewportMode();
  const isCompact = viewportMode === "compact";
  const canOpenIncident = canViewIncidents(user?.role);

  const close = useCallback(() => setOpen(false), []);

  useBodyScrollLock(open && isCompact);
  useDialogFocus(open && isCompact, panelRef, triggerRef, close, closeRef);

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
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
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
        ref={triggerRef}
        className="icon-btn"
        aria-label="Notifikasi"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) {
            void load();
            const id = window.setInterval(() => void load(), 60000);
            window.setTimeout(() => window.clearInterval(id), 60_000);
          }
        }}
      >
        <IconBell />
        {unread > 0 ? <span className="bell-dot" /> : null}
      </button>
      {open ? (() => {
        const panel = (
        <div
          ref={panelRef}
          id={panelId}
          className={`notif-panel${isCompact ? " notif-panel-mobile" : ""}`}
          role="dialog"
          aria-modal={isCompact ? true : undefined}
          aria-labelledby={titleId}
        >
          <div className="notif-header">
            <strong id={titleId}>Notifikasi</strong>
            <div className="notif-header-actions">
              {unread > 0 ? (
                <button type="button" className="btn btn-ghost" style={{ height: 32 }} onClick={() => void markAll()}>
                  Tandai dibaca
                </button>
              ) : null}
              <button
                ref={closeRef}
                type="button"
                className="icon-btn notif-close-mobile"
                aria-label="Tutup notifikasi"
                onClick={close}
              >
                ×
              </button>
            </div>
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
                if (n.incident_id && canOpenIncident) {
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
        );
        if (isCompact && typeof document !== "undefined") {
          return createPortal(
            <>
              <div className="notif-mobile-backdrop" aria-hidden="true" onMouseDown={close} />
              {panel}
            </>,
            document.body,
          );
        }
        return panel;
      })() : null}
    </div>
  );
}
