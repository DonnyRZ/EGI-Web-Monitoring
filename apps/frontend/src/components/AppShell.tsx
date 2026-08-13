"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  canManagePlatform,
  canViewDeveloperWorkload,
  canViewIncidents,
  canViewTasks,
  initials,
  isEndUserPublicDashboard,
} from "@/lib/format";
import { incidentsApi, tasksApi } from "@/lib/api-services";
import { NotificationBell } from "./NotificationBell";
import {
  IconAlert,
  IconDashboard,
  IconGlobe,
  IconLogout,
  IconMenu,
  IconTasks,
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

let myOpenTasksCache = 0;
let myOpenTasksCachedAt = 0;
let myOpenTasksRequest: Promise<number> | null = null;

/** Developer's own pending + in_progress task count, shown as a nav badge so they see workload before opening the page. */
function loadMyOpenTasks() {
  const now = Date.now();
  if (now - myOpenTasksCachedAt < 30_000) {
    return Promise.resolve(myOpenTasksCache);
  }
  if (!myOpenTasksRequest) {
    myOpenTasksRequest = tasksApi
      .list({ limit: 100 })
      .then((res) => {
        const count = res.data.filter(
          (t) => t.status === "pending" || t.status === "in_progress",
        ).length;
        myOpenTasksCache = count;
        myOpenTasksCachedAt = Date.now();
        return myOpenTasksCache;
      })
      .finally(() => {
        myOpenTasksRequest = null;
      });
  }
  return myOpenTasksRequest;
}

export function AppShell({ title, children, actions }: AppShellProps) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [myOpenTasks, setMyOpenTasks] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user || !canViewIncidents(user.role)) return;
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

  useEffect(() => {
    if (!user || user.role !== "developer") return;
    let cancelled = false;
    loadMyOpenTasks()
      .then((count) => {
        if (!cancelled) setMyOpenTasks(count);
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

  const isGallery = isEndUserPublicDashboard(user.role);

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
    ...(canViewTasks(user.role)
      ? [
          {
            href: "/tasks",
            label: user.role === "developer" ? "To-Do List" : "Task Monitoring",
            icon: IconTasks,
            badge: user.role === "developer" && myOpenTasks > 0 ? myOpenTasks : undefined,
          },
        ]
      : []),
    ...(user.role === "superadmin" || user.role === "bos_it"
      ? [{ href: "/tickets", label: "Tiket", icon: IconTasks }]
      : []),
    ...(user.role === "pic_web"
      ? [{ href: "/pic-web/tickets", label: "Tiket Saya", icon: IconTasks }]
      : []),
    ...(canViewDeveloperWorkload(user.role)
      ? [{ href: "/team", label: "Developer", icon: IconUsers }]
      : []),
    ...(canViewIncidents(user.role)
      ? [
          {
            href: "/incidents",
            label: "Incidents",
            icon: IconAlert,
            badge: activeIncidents > 0 ? activeIncidents : undefined,
          },
        ]
      : []),
    ...(canManagePlatform(user.role)
      ? [
          { href: "/admin/websites", label: "Kelola Website", icon: IconGlobe },
          { href: "/admin/assignments", label: "PIC & Assignment", icon: IconUsers },
          { href: "/admin/users", label: "Users", icon: IconUsers },
        ]
      : []),
  ];

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className={`app-shell${isGallery ? " gallery" : ""}`}>
      {!isGallery && sidebarOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Tutup menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {!isGallery ? (
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/logo-egi.png" alt="EGResources" />
          <div className="sidebar-brand-text">
            <strong>Hello IT</strong>
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
      ) : null}

      <div className="shell-main">
        <header className="top-header">
          <div className="header-left">
            {!isGallery ? (
            <button
              type="button"
              className="icon-btn menu-toggle"
              aria-label="Buka menu"
              onClick={() => setSidebarOpen(true)}
            >
              <IconMenu />
            </button>
            ) : (
              <img src="/logo-egi.png" alt="EGResources" className="gallery-header-logo" />
            )}
            <h1 className="page-title">{title}</h1>
            {actions}
          </div>
          <div className="header-actions">
            {isGallery ? (
              <button type="button" className="btn" onClick={() => void onLogout()}>
                Logout
              </button>
            ) : (
              <>
                <NotificationBell />
                <div className="user-menu" title={user.email}>
                  <span className="avatar">{initials(user.name)}</span>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
