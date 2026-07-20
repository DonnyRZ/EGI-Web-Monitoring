import assert from "node:assert/strict";
import test from "node:test";
import { assertS3ProductionConfig, ensureBucket } from "./s3";

test("requires non-default S3 credentials in production", () => {
  assert.throws(() => assertS3ProductionConfig({ NODE_ENV: "production", S3_ACCESS_KEY: "minioadmin", S3_SECRET_KEY: "change_me_minio" }));
  assert.doesNotThrow(() => assertS3ProductionConfig({ NODE_ENV: "production", S3_ACCESS_KEY: "worker-access", S3_SECRET_KEY: "worker-secret" }));
});

test("creates a bucket only when HeadBucket reports 404", async () => {
  const sent: unknown[] = [];
  const client = { send: async (command: unknown) => {
    sent.push(command);
    if (sent.length === 1) throw { $metadata: { httpStatusCode: 404 } };
  } };
  await ensureBucket(client as never, "screenshots");
  assert.equal(sent.length, 2);
});

test("does not hide S3 authentication or network errors", async () => {
  const failure = { $metadata: { httpStatusCode: 403 } };
  const client = { send: async () => { throw failure; } };
  await assert.rejects(() => ensureBucket(client as never, "screenshots"), (error) => error === failure);
});
