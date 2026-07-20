import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service";
import { hashToken } from "../../common/crypto";

const user = { id: "user-1", email: "user@example.test", role: "it_ops", isActive: true };

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
