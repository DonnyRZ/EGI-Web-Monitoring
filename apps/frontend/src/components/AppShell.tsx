"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth-context";
import {
  initials,
  isEndUserPublicDashboard,
  roleLabel,
} from "@/lib/format";
import { loadActiveIncidents, loadMyOpenTasks } from "@/lib/navigation-badges";
import { NotificationBell } from "./NotificationBell";
import { MobileBottomNav, MobileNavigationSkeleton, MobileTopNav, NavigationIcon } from "./MobileNavigation";
import { buildNavigationCatalog, canNavigateIncidents } from "@/lib/mobile-navigation";
import { loadProjectPicDeveloperScope } from "@/lib/project-scope";
import { IconLogout } from "./icons";

interface AppShellProps {
  title?: string;
  children: ReactNode;
}

interface AppShellHostValue {
  setPageTitle: (title: string) => void;
}

const AppShellHostContext = createContext<AppShellHostValue | null>(null);

const PUBLIC_ROUTES = new Set(["/login", "/forgot-password", "/reset-password"]);

function routeTitle(pathname: string) {
  if (pathname === "/tasks") return "Task Monitoring";
  if (pathname === "/me/work") return "My Work";
  if (pathname === "/projects") return "Project";
  if (pathname.startsWith("/projects/")) return "Project";
  if (pathname === "/user-stories") return "User Stories";
  if (pathname === "/menu") return "Menu";
  if (pathname === "/incidents") return "Incidents";
  if (pathname.startsWith("/incidents/")) return "Detail Incident";
  if (pathname.startsWith("/websites/")) return "Detail Website";
  if (pathname === "/admin/users") return "Users";
  return "Dashboard";
}

function mobilePageTitle(title: string) {
  if (title === "Task Monitoring") return "Task";
  if (title === "Kelola Project" || title === "Project Saya") return "Project";
  if (title === "My Work") return "Work";
  if (title === "Incidents" || title === "Detail Incident") return "Insiden";
  return title;
}

// Badges are secondary information; leave the first paint and page request
// uncontested before loading their counters.
const BACKGROUND_BADGE_DELAY_MS = 1_000;

function scheduleBackground(callback: () => void) {
  const timer = window.setTimeout(callback, BACKGROUND_BADGE_DELAY_MS);
  return () => window.clearTimeout(timer);
}

export function AppShell({ title, children }: AppShellProps) {
  const host = useContext(AppShellHostContext);
  const pathname = usePathname();

  useEffect(() => {
    if (host) host.setPageTitle(title || routeTitle(pathname));
  }, [host, pathname, title]);

  // Pages historically wrapped themselves in AppShell. Keep those wrappers
  // source-compatible while letting the root layout own one persistent shell.
  if (host) return <>{children}</>;
  if (PUBLIC_ROUTES.has(pathname)) return <>{children}</>;

  return <AppShellFrame initialTitle={title}>{children}</AppShellFrame>;
}

function AppShellFrame({ initialTitle, children }: { initialTitle?: string; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [myOpenTasks, setMyOpenTasks] = useState(0);
  const [isProjectPicDeveloper, setIsProjectPicDeveloper] = useState(false);
  const [projectScopeReady, setProjectScopeReady] = useState(false);
  const [pageTitle, setPageTitleState] = useState(() => initialTitle || routeTitle(pathname));
  const titleOverrideRef = useRef<{ pathname: string; title: string } | null>(null);
  const isGallery = isEndUserPublicDashboard(user?.role);

  const setPageTitle = useCallback((nextTitle: string) => {
    titleOverrideRef.current = { pathname, title: nextTitle };
    setPageTitleState(nextTitle);
  }, [pathname]);

  useEffect(() => {
    if (titleOverrideRef.current?.pathname === pathname) return;
    titleOverrideRef.current = null;
    setPageTitleState(initialTitle || routeTitle(pathname));
  }, [initialTitle, pathname]);

  const host = useMemo(() => ({ setPageTitle }), [setPageTitle]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user || !canNavigateIncidents(user.role)) return;
    let cancelled = false;
    const cancelSchedule = scheduleBackground(() => {
      loadActiveIncidents(user)
        .then((count) => {
          if (!cancelled) setActiveIncidents(count);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [user?.id, user?.role, loading]);

  useEffect(() => {
    if (loading || !user || user.role !== "developer") return;
    let cancelled = false;
    const cancelSchedule = scheduleBackground(() => {
      loadMyOpenTasks(user)
        .then((count) => {
          if (!cancelled) setMyOpenTasks(count);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [user?.id, user?.role, loading]);

  useEffect(() => {
    if (loading || !user || user.role !== "developer") {
      setIsProjectPicDeveloper(false);
      setProjectScopeReady(Boolean(user && user.role !== "developer"));
      return;
    }
    setProjectScopeReady(false);
    let cancelled = false;
    const cancelSchedule = scheduleBackground(() => {
      loadProjectPicDeveloperScope(user.id)
        .then((response) => {
          if (!cancelled) {
            setIsProjectPicDeveloper(response);
            setProjectScopeReady(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIsProjectPicDeveloper(false);
            setProjectScopeReady(true);
          }
        });
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [user?.id, user?.role, loading]);

  if (loading) {
    return (
      <div className="login-page">
        <div className="state-box" style={{ border: "none", background: "transparent" }}>
          Memuat…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-page">
        <div className="state-box">
          <h3>Sesi Anda berakhir</h3>
          <p>Silakan masuk kembali untuk melanjutkan.</p>
          <Link href="/login" className="btn btn-primary">Buka halaman login</Link>
        </div>
      </div>
    );
  }

  const navigation = buildNavigationCatalog(user.role, {
    isProjectPicDeveloper,
    scopeReady: projectScopeReady,
    activeIncidents,
    myOpenTasks,
  });

  const navSections = [
    {
      label: "Workspace",
      items: navigation.desktopNav.filter((item) =>
        ["/dashboard", "/tasks", "/me/work", "/projects"].includes(item.href),
      ),
    },
    {
      label: "Delivery",
      items: navigation.desktopNav.filter((item) => ["/user-stories", "/incidents"].includes(item.href)),
    },
    {
      label: "Administration",
      items: navigation.desktopNav.filter((item) => item.href === "/admin/users"),
    },
  ].filter((section) => section.items.length > 0);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <AppShellHostContext.Provider value={host}>
      <div className={`app-shell${isGallery ? " gallery" : ""}`}>
        {!isGallery ? (
        <aside className="sidebar">
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
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <NavigationIcon item={item} />
                    <span>{item.label}</span>
                    {item.badge ? (
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
              <span className="mobile-brand-mark" aria-hidden>EGI</span>
            ) : (
              <img src="/logo-egi.png" alt="EGResources" className="gallery-header-logo" />
            )}
            {!isGallery ? (
              <h1 className="page-title">
                <span className="page-title-desktop">{pageTitle}</span>
                <span className="page-title-mobile">{mobilePageTitle(pageTitle)}</span>
              </h1>
            ) : null}
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
        {!isGallery ? (
          navigation.ready ? <MobileTopNav items={navigation.primaryNav} pathname={pathname} /> : <MobileNavigationSkeleton />
        ) : null}
        <main className="content">{children}</main>
        {!isGallery && navigation.ready ? <MobileBottomNav items={navigation.primaryNav} pathname={pathname} /> : null}
      </div>
      </div>
    </AppShellHostContext.Provider>
  );
}
