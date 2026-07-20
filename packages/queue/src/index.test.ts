import assert from "node:assert/strict";
import test from "node:test";
import { assertRedisProductionConfig } from "./index";

test("Redis password is mandatory in production but optional in development", () => {
  assert.throws(() => assertRedisProductionConfig({ NODE_ENV: "production" }), /REDIS_PASSWORD/);
  const production = { NODE_ENV: "production", REDIS_PASSWORD: "secret", DATABASE_URL: "postgresql://egi:strong-password@db/egi" };
  assert.doesNotThrow(() => assertRedisProductionConfig(production));
  assert.throws(() => assertRedisProductionConfig({ ...production, DATABASE_URL: "postgresql://egi:change_me_postgres@db/egi" }), /DATABASE_URL/);
  assert.doesNotThrow(() => assertRedisProductionConfig({ NODE_ENV: "development" }));
});
