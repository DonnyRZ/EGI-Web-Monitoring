import { compareSync, hashSync } from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const BCRYPT_ROUNDS = 10;

/** bcrypt password hash (replaces legacy SHA-256 hex). */
export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against bcrypt (preferred) or legacy SHA-256 hex hashes
 * so older rows keep working until re-seed / password update.
 */
export function verifyPassword(password: string, passwordHash: string): boolean {
  if (passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$")) {
    return compareSync(password, passwordHash);
  }

  // Legacy SHA-256 hex (pre-bcrypt MVP seed)
  const hashed = Buffer.from(createHash("sha256").update(password).digest("hex"), "utf8");
  const expected = Buffer.from(passwordHash, "utf8");
  if (hashed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(hashed, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("hex");
}
