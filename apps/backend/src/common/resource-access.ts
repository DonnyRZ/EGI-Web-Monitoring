import { Prisma, UserRole } from "@egi/database";
import {
  ALL_RESOURCE_ACCESS_ROLES,
  INCIDENT_MANAGER_ROLES,
  PLATFORM_ADMIN_ROLES,
  PROJECT_ADMIN_ROLES,
  PROJECT_REQUEST_CREATOR_ROLES,
  PROJECT_REQUEST_REVIEWER_ROLES,
  USER_STORY_MANAGER_ROLES,
  TASK_INTAKE_CREATOR_ROLES,
  TICKET_MANAGER_ROLES,
  WORKLOAD_VIEWER_ROLES,
  canAccessAllMonitoredResources as roleCanAccessAllMonitoredResources,
} from "@egi/shared-types";
import type { AuthUser } from "./current-user.decorator";

function asPrismaRoles(roles: readonly string[]): UserRole[] {
  return [...roles] as UserRole[];
}

/** @Roles(...) — users + websites admin. */
export const PLATFORM_ADMIN_ROLES_PRISMA = asPrismaRoles(PLATFORM_ADMIN_ROLES);

/** Project registry and assignment administration. */
export const PROJECT_ADMIN_ROLES_PRISMA = asPrismaRoles(PROJECT_ADMIN_ROLES);

/** Project request submitters. */
export const PROJECT_REQUEST_CREATOR_ROLES_PRISMA = asPrismaRoles(PROJECT_REQUEST_CREATOR_ROLES);

/** Project request reviewers and Project Draft creators. */
export const PROJECT_REQUEST_REVIEWER_ROLES_PRISMA = asPrismaRoles(PROJECT_REQUEST_REVIEWER_ROLES);

/** Story creation and assignment; developer is scoped per project in the service. */
export const USER_STORY_MANAGER_ROLES_PRISMA = asPrismaRoles(USER_STORY_MANAGER_ROLES);

/** @Roles(...) — mutate / close incidents. */
export const INCIDENT_MANAGER_ROLES_PRISMA = asPrismaRoles(INCIDENT_MANAGER_ROLES);

/** @Roles(...) — create / update tickets. */
export const TICKET_MANAGER_ROLES_PRISMA = asPrismaRoles(TICKET_MANAGER_ROLES);

/** @Roles(...) — create business Task intake records. */
export const TASK_INTAKE_CREATOR_ROLES_PRISMA = asPrismaRoles(TASK_INTAKE_CREATOR_ROLES);

/** @Roles(...) — view developer workload/overdue summary. */
export const WORKLOAD_VIEWER_ROLES_PRISMA = asPrismaRoles(WORKLOAD_VIEWER_ROLES);

/**
 * These roles operate the monitoring platform and must be able to investigate
 * every service (probe detail, incidents, tickets).
 */
export const OPERATIONAL_ROLES_PRISMA = asPrismaRoles(ALL_RESOURCE_ACCESS_ROLES);

export function canAccessAllMonitoredResources(user: AuthUser): boolean {
  return roleCanAccessAllMonitoredResources(user.role);
}

/** PIC Web may operate monitoring resources, but only inside owned websites. */
export function canOperateScopedResources(user: AuthUser): boolean {
  return canAccessAllMonitoredResources(user) || user.role === "pic_web";
}

export function websiteOwnerScope(user: AuthUser): { ownerId?: string } {
  return user.role === "pic_web" ? { ownerId: user.id } : {};
}

/**
 * Website visibility after the Project transition. The legacy predicates are
 * intentionally retained only for websites that have not been backfilled yet.
 */
export function websiteVisibilityScope(user: AuthUser): Prisma.WebsiteWhereInput {
  if (user.role === "superadmin" || user.role === "bos_it") return {};
  if (user.role === "pic_web") {
    return {
      OR: [
        { project: { members: { some: { userId: user.id, memberType: "pic_web" } } } },
        { projectId: null, ownerId: user.id },
      ],
    };
  }
  if (user.role === "developer") {
    return {
      OR: [
        { project: { picDeveloperId: user.id } },
        { project: { members: { some: { userId: user.id, memberType: "developer" } } } },
        { projectId: null, OR: [{ itPicId: user.id }, { backupItPicId: user.id }] },
      ],
    };
  }
  return { isActive: true };
}

export function monitoringResultScope(user: AuthUser) {
  return { website: websiteVisibilityScope(user) };
}

/**
 * Server-side project visibility. Query-string filters are applied on top of
 * this predicate so a client cannot widen its scope by changing a project id.
 */
export function projectVisibilityWhere(user: AuthUser): Prisma.ProjectWhereInput {
  if (user.role === "superadmin" || user.role === "bos_it") return {};
  if (user.role === "pic_web") {
    return { members: { some: { userId: user.id, memberType: "pic_web" } } };
  }
  if (user.role === "developer") {
    return {
      OR: [
        { picDeveloperId: user.id },
        { members: { some: { userId: user.id, memberType: "developer" } } },
      ],
    };
  }
  return { id: "00000000-0000-0000-0000-000000000000" };
}

export function canManageProjectConfiguration(user: AuthUser): boolean {
  return user.role === "superadmin" || user.role === "bos_it";
}

export function canManageProjectStories(user: AuthUser): boolean {
  return user.role === "superadmin" || user.role === "bos_it" || user.role === "developer";
}
