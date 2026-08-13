import assert from "node:assert/strict";
import test from "node:test";
import { NotificationChannel } from "@egi/database";
import { AuthService } from "./auth.service";
import { hashToken } from "../../common/crypto";

const user = { id: "user-1", email: "user@example.test", role: "superadmin", isActive: true };

function makeService(updateCount = 1) {
  const prisma = {
    userSession: {
      findFirst: async () => ({ id: "session-1", user }),
      updateMany: async () => ({ count: updateCount }),
    },
  };
  const jwt = { signAsync: async () => "access-token" };
  return new AuthService(prisma as never, jwt as never);
}

test("refresh rotates the token and persists only its replacement hash", async () => {
  const original = "original-refresh-token";
  const response = await makeService().refresh(original);
  assert.equal(response.access_token, "access-token");
  assert.notEqual(response.refresh_token, original);
  assert.notEqual(hashToken(response.refresh_token), hashToken(original));
});

test("refresh rejects a replay that loses the atomic rotation race", async () => {
  await assert.rejects(() => makeService(0).refresh("replayed-token"), /Invalid refresh token/);
});

const guestUser = {
  id: "guest-1",
  name: "Guest",
  email: "guest@egiresources.com",
  role: "end_user",
  telegramChatId: null,
  emailVerifiedAt: new Date(),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeGuestService(user: typeof guestUser | (Omit<typeof guestUser, "role" | "isActive"> & { role: string; isActive: boolean }) | null) {
  const sessions: Record<string, unknown>[] = [];
  const prisma = {
    user: {
      findUnique: async () => user,
    },
    userSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        sessions.push(data);
        return data;
      },
    },
  };
  const jwt = { signAsync: async () => "guest-access-token" };
  return { service: new AuthService(prisma as never, jwt as never), sessions };
}

test("guest issues tokens for the seeded end_user without a password", async () => {
  const { service, sessions } = makeGuestService(guestUser);

  const response = await service.guest();

  assert.equal(response.access_token, "guest-access-token");
  assert.ok(response.refresh_token);
  assert.equal(response.user.role, "end_user");
  assert.equal(response.user.email, guestUser.email);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.userId, guestUser.id);
});

test("guest fails when the account is missing or inactive", async () => {
  await assert.rejects(() => makeGuestService(null).service.guest(), /unavailable/);
  await assert.rejects(
    () => makeGuestService({ ...guestUser, isActive: false }).service.guest(),
    /unavailable/,
  );
  await assert.rejects(
    () => makeGuestService({ ...guestUser, role: "developer" }).service.guest(),
    /unavailable/,
  );
});

type ResetOverrides = {
  user?: { id: string; email: string; name: string; isActive: boolean } | null;
  recentCount?: number;
  tokenRecord?: { id: string; userId: string; usedAt: null; expiresAt: Date } | null;
  updateManyCount?: number;
};

function makeResetService(overrides: ResetOverrides = {}) {
  const createdTokens: Record<string, unknown>[] = [];
  const notifications: Record<string, unknown>[] = [];
  const userUpdates: Record<string, unknown>[] = [];
  const sessionRevokes: Record<string, unknown>[] = [];

  const prisma = {
    user: {
      findUnique: async () => overrides.user ?? null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        userUpdates.push(data);
        return data;
      },
    },
    passwordResetToken: {
      count: async () => overrides.recentCount ?? 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdTokens.push(data);
        return { id: "token-row-1", ...data };
      },
      findFirst: async () => overrides.tokenRecord ?? null,
      updateMany: async () => ({ count: overrides.updateManyCount ?? 1 }),
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data);
        return data;
      },
    },
    userSession: {
      updateMany: async (args: Record<string, unknown>) => {
        sessionRevokes.push(args);
        return { count: 1 };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const jwt = { signAsync: async () => "access-token" };
  return {
    service: new AuthService(prisma as never, jwt as never),
    createdTokens,
    notifications,
    userUpdates,
    sessionRevokes,
  };
}

test("forgotPassword creates a reset token + email notification for an active user", async () => {
  const activeUser = { id: "user-1", email: "user@example.test", name: "User Satu", isActive: true };
  const { service, createdTokens, notifications } = makeResetService({ user: activeUser });

  const res = await service.forgotPassword(activeUser.email);

  assert.match(res.message, /reset password/i);
  assert.equal(createdTokens.length, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.userId, activeUser.id);
  assert.equal(notifications[0]?.channel, NotificationChannel.email);
});

test("forgotPassword for an unknown email creates nothing but still returns the generic message", async () => {
  const { service, createdTokens, notifications } = makeResetService({ user: null });

  const res = await service.forgotPassword("nobody@example.test");

  assert.equal(createdTokens.length, 0);
  assert.equal(notifications.length, 0);
  assert.match(res.message, /reset password/i);
});

test("forgotPassword is silently rate-limited after 3 requests within the window", async () => {
  const activeUser = { id: "user-1", email: "user@example.test", name: "User Satu", isActive: true };
  const { service, createdTokens, notifications } = makeResetService({ user: activeUser, recentCount: 3 });

  const res = await service.forgotPassword(activeUser.email);

  assert.equal(createdTokens.length, 0);
  assert.equal(notifications.length, 0);
  assert.match(res.message, /reset password/i);
});

test("resetPassword updates the password hash and revokes all sessions on a valid token", async () => {
  const tokenRecord = { id: "token-1", userId: "user-1", usedAt: null, expiresAt: new Date(Date.now() + 60_000) };
  const { service, userUpdates, sessionRevokes } = makeResetService({ tokenRecord });

  const res = await service.resetPassword("valid-token", "NewPassword123");

  assert.match(res.message, /berhasil/i);
  assert.equal(userUpdates.length, 1);
  assert.equal(sessionRevokes.length, 1);
  assert.equal((sessionRevokes[0]?.where as Record<string, unknown>)?.userId, "user-1");
});

test("resetPassword rejects a missing, expired, or already-used token", async () => {
  const { service, userUpdates } = makeResetService({ tokenRecord: null });

  await assert.rejects(() => service.resetPassword("bad-token", "NewPassword123"), /tidak valid/);
  assert.equal(userUpdates.length, 0);
});

test("resetPassword rejects a replay that loses the atomic claim race", async () => {
  const tokenRecord = { id: "token-1", userId: "user-1", usedAt: null, expiresAt: new Date(Date.now() + 60_000) };
  const { service, userUpdates } = makeResetService({ tokenRecord, updateManyCount: 0 });

  await assert.rejects(() => service.resetPassword("raced-token", "NewPassword123"), /tidak valid/);
  assert.equal(userUpdates.length, 0);
});
