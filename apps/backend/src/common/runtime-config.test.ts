import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionRuntimeConfig, shouldEnableSwagger } from "./runtime-config";

const production = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  S3_ACCESS_KEY: "egi-production-access",
  S3_SECRET_KEY: "egi-production-secret",
  CORS_ORIGINS: "https://monitor.example",
  DATABASE_URL: "postgresql://egi:strong-password@db/egi",
};

test("accepts explicit non-default production secrets", () => {
  assert.doesNotThrow(() => assertProductionRuntimeConfig(production));
});

test("rejects missing, placeholder, and short production secrets", () => {
  assert.throws(() => assertProductionRuntimeConfig({ ...production, S3_SECRET_KEY: "change_me_minio" }));
  assert.throws(() => assertProductionRuntimeConfig({ ...production, JWT_ACCESS_SECRET: "short" }));
  assert.throws(() => assertProductionRuntimeConfig({ ...production, JWT_REFRESH_SECRET: undefined }));
  assert.throws(() => assertProductionRuntimeConfig({ ...production, CORS_ORIGINS: "" }));
  assert.throws(() => assertProductionRuntimeConfig({ ...production, DATABASE_URL: "postgresql://egi:change_me_postgres@db/egi" }));
});

test("does not constrain development configuration", () => {
  assert.doesNotThrow(() => assertProductionRuntimeConfig({ NODE_ENV: "development" }));
});

test("Swagger is closed by default in production and open during development", () => {
  assert.equal(shouldEnableSwagger({ NODE_ENV: "production" }), false);
  assert.equal(shouldEnableSwagger({ NODE_ENV: "production", ENABLE_SWAGGER: "true" }), true);
  assert.equal(shouldEnableSwagger({ NODE_ENV: "development" }), true);
  assert.equal(shouldEnableSwagger({ NODE_ENV: "development", ENABLE_SWAGGER: "false" }), false);
});
