import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../../next.config";

type CacheHeaderRule = { source?: string; headers?: Array<{ key: string; value: string }> };

function cacheControlFor(source: string, headers: CacheHeaderRule[] | undefined) {
  const entry = (headers ?? []).find((item) => item.source === source);
  return entry?.headers?.find((header) => header.key.toLowerCase() === "cache-control")?.value;
}

test("HTML shell routes revalidate without serving stale builds", async () => {
  const headers = await nextConfig.headers?.();
  assert.equal(cacheControlFor("/dashboard", headers), "private, no-cache, must-revalidate");
  assert.equal(cacheControlFor("/projects/:path*", headers), "private, no-cache, must-revalidate");
});

test("hashed Next assets remain immutable and app-version is never cached", async () => {
  const headers = await nextConfig.headers?.();
  assert.equal(cacheControlFor("/_next/static/:path*", headers), "public, max-age=31536000, immutable");
  assert.equal(cacheControlFor("/app-version", headers), "no-store");
});
