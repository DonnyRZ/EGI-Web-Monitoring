import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedLiveWebsiteUrl, normalizeLiveWebsiteUrl } from "./website-experience";

test("live viewer accepts ordinary HTTP(S) website URLs", () => {
  const result = normalizeLiveWebsiteUrl("https://example.com/path?q=1");

  assert.deepEqual(result, {
    href: "https://example.com/path?q=1",
    hostname: "example.com",
  });
  assert.equal(isSupportedLiveWebsiteUrl("http://example.test"), true);
});

test("live viewer rejects unsafe, credential-bearing, and invalid URLs", () => {
  assert.equal(isSupportedLiveWebsiteUrl("javascript:alert(1)"), false);
  assert.equal(isSupportedLiveWebsiteUrl("data:text/html,hello"), false);
  assert.equal(isSupportedLiveWebsiteUrl("https://user:secret@example.com"), false);
  assert.equal(isSupportedLiveWebsiteUrl("not a URL"), false);
  assert.equal(normalizeLiveWebsiteUrl(null), null);
});
