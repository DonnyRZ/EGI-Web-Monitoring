import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeProbeUrl } from "./target-safety";

test("blocks private probe targets", async () => {
  await assert.rejects(() => assertSafeProbeUrl("http://127.0.0.1/"));
  await assert.rejects(() => assertSafeProbeUrl("https://service.example/", async () => [{ address: "10.0.0.7" }]));
});

test("allows public probe targets", async () => {
  const url = await assertSafeProbeUrl("https://service.example/path", async () => [{ address: "203.0.113.10" }]);
  assert.equal(url.hostname, "service.example");
});
