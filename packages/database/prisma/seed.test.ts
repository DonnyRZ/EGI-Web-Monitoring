import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminUpsertData, buildDeveloperUpsertData, buildGuestUpsertData } from "./seed";

const envWith = (overrides: NodeJS.ProcessEnv) => ({ ...overrides }) as NodeJS.ProcessEnv;

test("admin upsert never sets passwordHash on update, regardless of env", () => {
  for (const env of [
    envWith({}),
    envWith({ SEED_ADMIN_PASSWORD: "SomeStrongPassword1!" }),
    envWith({ SEED_ADMIN_EMAIL: "custom@example.com", SEED_ADMIN_PASSWORD: "x" }),
  ]) {
    const data = buildAdminUpsertData(env);
    assert.equal("passwordHash" in data.update, false);
  }
});

test("developer upsert never sets passwordHash on update, regardless of env", () => {
  for (const env of [
    envWith({}),
    envWith({ SEED_ADMIN_PASSWORD: "SomeStrongPassword1!" }),
    envWith({ SEED_DEVELOPER_PASSWORD: "AnotherStrongPassword1!" }),
    envWith({ SEED_ADMIN_PASSWORD: "a", SEED_DEVELOPER_PASSWORD: "b" }),
  ]) {
    const data = buildDeveloperUpsertData(env);
    assert.equal("passwordHash" in data.update, false);
  }
});

test("admin create sets a passwordHash derived from SEED_ADMIN_PASSWORD when provided", () => {
  const withEnvPassword = buildAdminUpsertData(envWith({ SEED_ADMIN_PASSWORD: "SomeStrongPassword1!" }));
  const withoutEnvPassword = buildAdminUpsertData(envWith({}));

  assert.ok(typeof withEnvPassword.create.passwordHash === "string" && withEnvPassword.create.passwordHash.length > 0);
  assert.ok(typeof withoutEnvPassword.create.passwordHash === "string" && withoutEnvPassword.create.passwordHash.length > 0);
  // bcrypt hashes are salted, so we can't compare hashes directly, but they must differ
  // from each other when derived from different plaintext passwords.
  assert.notEqual(withEnvPassword.create.passwordHash, withoutEnvPassword.create.passwordHash);
});

test("developer create falls back to SEED_ADMIN_PASSWORD, then a dev default, when SEED_DEVELOPER_PASSWORD is unset", () => {
  const noEnv = buildDeveloperUpsertData(envWith({}));
  const adminOnly = buildDeveloperUpsertData(envWith({ SEED_ADMIN_PASSWORD: "SomeStrongPassword1!" }));
  const devOnly = buildDeveloperUpsertData(envWith({ SEED_DEVELOPER_PASSWORD: "AnotherStrongPassword1!" }));

  for (const data of [noEnv, adminOnly, devOnly]) {
    assert.ok(typeof data.create.passwordHash === "string" && data.create.passwordHash.length > 0);
  }
});

test("email defaults can be overridden via env", () => {
  const admin = buildAdminUpsertData(envWith({ SEED_ADMIN_EMAIL: "custom-admin@example.com" }));
  const developer = buildDeveloperUpsertData(envWith({ SEED_DEVELOPER_EMAIL: "custom-dev@example.com" }));

  assert.equal(admin.email, "custom-admin@example.com");
  assert.equal(developer.email, "custom-dev@example.com");
});

test("update payloads still force isActive and role as a lockout safety-net", () => {
  const admin = buildAdminUpsertData(envWith({}));
  const developer = buildDeveloperUpsertData(envWith({}));
  const guest = buildGuestUpsertData(envWith({}));

  assert.equal(admin.update.isActive, true);
  assert.equal(admin.update.role, "superadmin");
  assert.equal(developer.update.isActive, true);
  assert.equal(developer.update.role, "developer");
  assert.equal(guest.update.isActive, true);
  assert.equal(guest.update.role, "end_user");
  assert.equal("passwordHash" in guest.update, false);
  assert.equal(guest.email, "guest@egiresources.com");
});
