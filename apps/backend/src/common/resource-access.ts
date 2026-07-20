import { UserRole } from "@egi/database";
import type { AuthUser } from "./current-user.decorator";

// These roles operate the monitoring platform and must be able to investigate
// every service. Other authenticated roles are limited to their owner_id.
const OPERATIONAL_ROLES = new Set<string>([
  UserRole.it_ops,
  UserRole.helpdesk,
  UserRole.developer,
]);

export function canAccessAllMonitoredResources(user: AuthUser): boolean {
  return OPERATIONAL_ROLES.has(user.role);
}
