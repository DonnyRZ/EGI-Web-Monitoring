import assert from "node:assert/strict";
import test from "node:test";
import { runProbes } from "./probes";

test("invalid target is aborted before any HTTP request", async () => {
  const result = await runProbes({
    url: "http://127.0.0.1:3000/private",
    httpTimeoutMs: 1_000,
  });

  assert.equal(result.probeAborted, true);
  assert.equal(result.infrastructureFailure, false);
  assert.equal(result.httpStatus, null);
});

test("HTTP-only probe returns a health result without visual fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

  try {
    const result = await runProbes({
      url: "https://1.1.1.1",
      httpTimeoutMs: 1_000,
    });

    assert.equal(result.httpOk, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.errorMessage, null);
    assert.equal("screenshotBuffer" in result, false);
    assert.equal("renderTimeMs" in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
