"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { initials, isItOps } from "@/lib/format";
import { incidentsApi } from "@/lib/api-services";
import { NotificationBell } from "./NotificationBell";
import {
  IconAlert,
  IconDashboard,
  IconGlobe,
  IconLogout,
  IconMenu,
  IconUsers,
} from "./icons";

interface AppShellProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

let activeIncidentsCache = 0;
let activeIncidentsCachedAt = 0;
let activeIncidentsRequest: Promise<number> | null = null;

function loadActiveIncidents() {
  const now = Date.now();
  if (now - activeIncidentsCachedAt < 30_000) {
    return Promise.resolve(activeIncidentsCache);
  }
  if (!activeIncidentsRequest) {
    activeIncidentsRequest = incidentsApi
      .list({ active_only: true, limit: 1 })
      .then((res) => {
        activeIncidentsCache = res.meta.total;
        activeIncidentsCachedAt = Date.now();
        return activeIncidentsCache;
      })
      .finally(() => {
        activeIncidentsRequest = null;
      });
  }
  return activeIncidentsRequest;
}

export function AppShell({ title, children, actions }: AppShellProps) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadActiveIncidents()
      .then((count) => {
        if (!cancelled) setActiveIncidents(count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="login-page">
        <div className="state-box" style={{ border: "none", background: "transparent" }}>
          Memuat…
        </div>
      </div>
    );
  }

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
    {
      href: "/incidents",
      label: "Incidents",
      icon: IconAlert,
      badge: activeIncidents > 0 ? activeIncidents : undefined,
    },
    ...(isItOps(user.role)
      ? [
          { href: "/admin/websites", label: "Kelola Website", icon: IconGlobe },
          { href: "/admin/users", label: "Users", icon: IconUsers },
        ]
      : []),
  ];

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="app-shell">
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Tutup menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Image src="/logo-egi.png" alt="EGI" width={42} height={42} />
          <div className="sidebar-brand-text">
            <strong>EGI Monitoring</strong>
            <span>Website Monitoring</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "active" : ""}`}
              >
                <span className="nav-icon" aria-hidden>
                  <Icon />
                </span>
                <span>{item.label}</span>
                {"badge" in item && item.badge ? (
                  <span className="nav-badge">{item.badge > 99 ? "99+" : item.badge}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="nav-item" onClick={() => void onLogout()}>
            <span className="nav-icon" aria-hidden>
              <IconLogout />
            </span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="top-header">
          <div className="header-left">
            <button
              type="button"
              className="icon-btn menu-toggle"
              aria-label="Buka menu"
              onClick={() => setSidebarOpen(true)}
            >
              <IconMenu />
            </button>
            <h1 className="page-title">{title}</h1>
            {actions}
          </div>
          <div className="header-actions">
            <NotificationBell />
            <div className="user-menu" title={user.email}>
              <span className="avatar">{initials(user.name)}</span>
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
