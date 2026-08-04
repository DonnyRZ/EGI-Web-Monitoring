import { UserRole } from "@egi/database";
import {
  ALL_RESOURCE_ACCESS_ROLES,
  INCIDENT_MANAGER_ROLES,
  PLATFORM_ADMIN_ROLES,
  TICKET_MANAGER_ROLES,
  canAccessAllMonitoredResources as roleCanAccessAllMonitoredResources,
} from "@egi/shared-types";
import type { AuthUser } from "./current-user.decorator";

function asPrismaRoles(roles: readonly string[]): UserRole[] {
  return [...roles] as UserRole[];
}

/** @Roles(...) — users + websites admin. */
export const PLATFORM_ADMIN_ROLES_PRISMA = asPrismaRoles(PLATFORM_ADMIN_ROLES);

/** @Roles(...) — mutate / close incidents. */
export const INCIDENT_MANAGER_ROLES_PRISMA = asPrismaRoles(INCIDENT_MANAGER_ROLES);

/** @Roles(...) — create / update tickets. */
export const TICKET_MANAGER_ROLES_PRISMA = asPrismaRoles(TICKET_MANAGER_ROLES);

/**
 * These roles operate the monitoring platform and must be able to investigate
 * every service. Other authenticated roles are limited to their owner_id.
 */
export const OPERATIONAL_ROLES_PRISMA = asPrismaRoles(ALL_RESOURCE_ACCESS_ROLES);

export function canAccessAllMonitoredResources(user: AuthUser): boolean {
  return roleCanAccessAllMonitoredResources(user.role);
}
