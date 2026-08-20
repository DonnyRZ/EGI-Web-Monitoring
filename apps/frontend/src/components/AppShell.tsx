"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  canManagePlatform,
  canViewIncidents,
  canViewProjectRegistry,
  canViewTaskMonitoring,
  canViewUserStories,
  initials,
  isEndUserPublicDashboard,
  roleLabel,
} from "@/lib/format";
import { incidentsApi, projectsApi, userStoriesApi } from "@/lib/api-services";
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
}

let activeIncidentsCache = 0;
let activeIncidentsCachedAt = 0;
let activeIncidentsRequest: Promise<number> | null = null;
let activeIncidentsCacheKey = "";

function loadActiveIncidents(user: { id: string; role: string }) {
  const now = Date.now();
  const key = `${user.id}:${user.role}`;
  if (key === activeIncidentsCacheKey && now - activeIncidentsCachedAt < 30_000) {
    return Promise.resolve(activeIncidentsCache);
  }
  if (!activeIncidentsRequest) {
    activeIncidentsRequest = incidentsApi
      .activeCount()
      .then((res) => {
        activeIncidentsCache = res.count;
        activeIncidentsCacheKey = key;
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
let myOpenTasksCacheKey = "";

/** Developer's own pending + in_progress task count, shown as a nav badge so they see workload before opening the page. */
function loadMyOpenTasks(user: { id: string }) {
  const now = Date.now();
  if (user.id === myOpenTasksCacheKey && now - myOpenTasksCachedAt < 30_000) {
    return Promise.resolve(myOpenTasksCache);
  }
  if (!myOpenTasksRequest) {
    myOpenTasksRequest = userStoriesApi
      .meWorkSummary()
      .then((res) => {
        const count = res.pending + res.in_progress;
        myOpenTasksCache = count;
        myOpenTasksCacheKey = user.id;
        myOpenTasksCachedAt = Date.now();
        return myOpenTasksCache;
      })
      .finally(() => {
        myOpenTasksRequest = null;
      });
  }
  return myOpenTasksRequest;
}

let projectScopeCache = false;
let projectScopeCachedAt = 0;
let projectScopeRequest: Promise<boolean> | null = null;
let projectScopeCacheKey = "";

function loadProjectScope(user: { id: string }) {
  const now = Date.now();
  if (user.id === projectScopeCacheKey && now - projectScopeCachedAt < 60_000) return Promise.resolve(projectScopeCache);
  if (!projectScopeRequest) {
    projectScopeRequest = projectsApi
      .scopeSummary()
      .then((res) => {
        projectScopeCache = res.has_pic_developer;
        projectScopeCacheKey = user.id;
        projectScopeCachedAt = Date.now();
        return projectScopeCache;
      })
      .finally(() => {
        projectScopeRequest = null;
      });
  }
  return projectScopeRequest;
}

export function AppShell({ title, children }: AppShellProps) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [myOpenTasks, setMyOpenTasks] = useState(0);
  const [isProjectPicDeveloper, setIsProjectPicDeveloper] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (loading || !user || !canViewIncidents(user.role)) return;
    let cancelled = false;
    loadActiveIncidents(user)
      .then((count) => {
        if (!cancelled) setActiveIncidents(count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, loading]);

  useEffect(() => {
    if (loading || !user || user.role !== "developer") return;
    let cancelled = false;
    loadMyOpenTasks(user)
      .then((count) => {
        if (!cancelled) setMyOpenTasks(count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, loading]);

  useEffect(() => {
    if (loading || !user || user.role !== "developer") {
      setIsProjectPicDeveloper(false);
      return;
    }
    let cancelled = false;
    loadProjectScope(user)
      .then((response) => {
        if (!cancelled) setIsProjectPicDeveloper(response);
      })
      .catch(() => {
        if (!cancelled) setIsProjectPicDeveloper(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, loading]);

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
    ...(canViewTaskMonitoring(user.role) && (user.role !== "developer" || isProjectPicDeveloper)
      ? [
          {
            href: "/tasks",
            label: "Task Monitoring",
            icon: IconTasks,
          },
        ]
      : []),
    ...(user.role === "developer"
      ? [{ href: "/me/work", label: "My Work", icon: IconTasks, badge: myOpenTasks > 0 ? myOpenTasks : undefined }]
      : []),
    ...(canViewProjectRegistry(user.role)
      ? [{ href: "/projects", label: user.role === "superadmin" || user.role === "bos_it" ? "Kelola Project" : "Project Saya", icon: IconGlobe }]
      : []),
    ...(canViewUserStories(user.role)
      ? [{ href: "/user-stories", label: "User Stories", icon: IconTasks }]
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
          { href: "/admin/users", label: "Users", icon: IconUsers },
        ]
      : []),
  ];

  const navSections = [
    {
      label: "Workspace",
      items: nav.filter((item) =>
        ["/dashboard", "/tasks", "/me/work", "/projects"].includes(item.href),
      ),
    },
    {
      label: "Delivery",
      items: nav.filter((item) => ["/user-stories", "/incidents"].includes(item.href)),
    },
    {
      label: "Administration",
      items: nav.filter((item) => item.href === "/admin/users"),
    },
  ].filter((section) => section.items.length > 0);

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
          {navSections.map((section) => (
            <div className="nav-section" key={section.label}>
              <span className="nav-section-label">{section.label}</span>
              {section.items.map((item) => {
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
            </div>
          ))}
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
            {!isGallery ? <h1 className="page-title">{title}</h1> : null}
            {isGallery ? (
              <div className="gallery-header-copy">
                <strong>Website Monitoring</strong>
                <span>Live health gallery</span>
              </div>
            ) : null}
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
                  <div className="user-menu-copy">
                    <strong>{user.name}</strong>
                    <span>{roleLabel(user.role)}</span>
                  </div>
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
