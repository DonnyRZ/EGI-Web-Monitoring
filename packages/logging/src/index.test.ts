import test from "node:test";
import assert from "node:assert/strict";
import { createRequestId, redact } from "./index";

test("redacts credentials recursively", () => {
  assert.deepEqual(redact({ password: "secret", nested: { access_token: "jwt" }, safe: "ok" }), {
    password: "[REDACTED]",
    nested: { access_token: "[REDACTED]" },
    safe: "ok",
  });
});

test("accepts safe request id and generates one otherwise", () => {
  assert.equal(createRequestId("req-123"), "req-123");
  assert.match(createRequestId(), /^[0-9a-f-]{36}$/);
  assert.notEqual(createRequestId("bad id"), "bad id");
});
