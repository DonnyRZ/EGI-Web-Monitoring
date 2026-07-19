import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@egi/database";

export const ROLES_KEY = "roles";

/** Require one of the given roles. Empty / omitted = any authenticated user. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
