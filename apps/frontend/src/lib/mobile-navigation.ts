import type { UserRole } from "@/lib/types";

export type NavigationIconKey =
  | "dashboard"
  | "tasks"
  | "my-work"
  | "projects"
  | "user-stories"
  | "incidents"
  | "users"
  | "menu"
  | "logout";

export type NavigationBadgeKey = "incidents" | "my-work";

export interface NavigationItem {
  key: NavigationIconKey;
  href: string;
  label: string;
  icon: NavigationIconKey;
  badgeKey?: NavigationBadgeKey;
  badge?: number;
}
export interface NavigationCounts {
  activeIncidents?: number;
  myOpenTasks?: number;
}

export interface NavigationContext extends NavigationCounts {
  isProjectPicDeveloper: boolean;
  scopeReady: boolean;
}

export interface NavigationCatalog {
  ready: boolean;
  primaryNav: NavigationItem[];
  menuNav: NavigationItem[];
  desktopNav: NavigationItem[];
}

export function canNavigateIncidents(role: UserRole): boolean {
  return role === "superadmin" || role === "bos_it" || role === "developer";
}

function item(
  key: NavigationIconKey,
  href: string,
  label: string,
  badgeKey?: NavigationBadgeKey,
  badge?: number,
): NavigationItem {
  return { key, href, label, icon: key, badgeKey, badge };
}

function withBadge(itemValue: NavigationItem, counts: NavigationCounts): NavigationItem {
  const badge = itemValue.badgeKey === "incidents"
    ? counts.activeIncidents
    : itemValue.badgeKey === "my-work"
      ? counts.myOpenTasks
      : undefined;
  return { ...itemValue, badge: badge && badge > 0 ? badge : undefined };
}

function commonDesktopItems(role: UserRole, context: NavigationContext): NavigationItem[] {
  const items: NavigationItem[] = [item("dashboard", "/dashboard", "Dashboard")];

  if (role !== "end_user" && (role !== "developer" || (context.scopeReady && context.isProjectPicDeveloper))) {
    items.push(item("tasks", "/tasks", "Task Monitoring"));
  }
  if (role === "developer") {
    items.push(item("my-work", "/me/work", "My Work", "my-work"));
  }
  if (role === "superadmin" || role === "bos_it" || role === "developer" || role === "pic_web") {
    items.push(item("projects", "/projects", role === "superadmin" || role === "bos_it" ? "Kelola Project" : "Project Saya"));
  }
  if (role === "superadmin" || role === "bos_it" || role === "developer") {
    items.push(item("user-stories", "/user-stories", "User Stories"));
  }
  if (canNavigateIncidents(role)) {
    items.push(item("incidents", "/incidents", "Incidents", "incidents"));
  }
  if (role === "superadmin") {
    items.push(item("users", "/admin/users", "Users"));
  }

  return items.map((entry) => withBadge(entry, context));
}

/**
 * Build the navigation in one place so mobile, tablet, and desktop cannot
 * accidentally drift apart when a role gains or loses a capability.
 */
export function buildNavigationCatalog(
  role: UserRole,
  context: NavigationContext,
): NavigationCatalog {
  const ready = role !== "developer" || context.scopeReady;
  const activeIncidents = context.activeIncidents;

  if (role === "end_user") {
    return { ready: true, primaryNav: [], menuNav: [], desktopNav: [] };
  }

  const menuEntry = canNavigateIncidents(role)
    ? withBadge(item("menu", "/menu", "Menu", "incidents", activeIncidents), context)
    : item("menu", "/menu", "Menu");
  const primaryNav: NavigationItem[] = [item("dashboard", "/dashboard", "Dashboard")];

  if (role === "superadmin" || role === "bos_it" || role === "pic_web") {
    primaryNav.push(item("tasks", "/tasks", "Task"));
  }

  if (role === "developer") {
    if (context.scopeReady && context.isProjectPicDeveloper) {
      primaryNav.push(item("tasks", "/tasks", "Task"));
    }
    primaryNav.push(item("my-work", "/me/work", "Work", "my-work"));
  }

  if (role === "superadmin" || role === "bos_it") {
    primaryNav.push(item("projects", "/projects", "Project"));
  } else if (role === "pic_web") {
    primaryNav.push(item("projects", "/projects", "Project"));
  } else if (role === "developer" && !context.isProjectPicDeveloper) {
    primaryNav.push(item("projects", "/projects", "Project"));
  }

  if (role === "superadmin" || role === "bos_it" || role === "developer") {
    primaryNav.push(item("user-stories", "/user-stories", "User Stories"));
  }
  primaryNav.push(menuEntry);

  const menuNav: NavigationItem[] = [];
  if (role === "developer" && context.scopeReady && context.isProjectPicDeveloper) {
    menuNav.push(item("projects", "/projects", "Project"));
  }
  if (canNavigateIncidents(role)) {
    menuNav.push(withBadge(item("incidents", "/incidents", "Insiden", "incidents"), context));
  }
  if (role === "superadmin") {
    menuNav.push(item("users", "/admin/users", "Users"));
  }
  menuNav.push(item("logout", "", "Logout"));

  return {
    ready,
    primaryNav: primaryNav.map((entry) => withBadge(entry, context)),
    menuNav,
    desktopNav: commonDesktopItems(role, context),
  };
}
