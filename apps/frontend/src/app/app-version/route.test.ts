import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "./route";

test("app-version exposes only the build version and disables caching", async () => {
  const previous = process.env.APP_BUILD_VERSION;
  process.env.APP_BUILD_VERSION = "test-commit-sha";

  try {
    const response = GET();
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { version: "test-commit-sha" });
  } finally {
    if (previous === undefined) delete process.env.APP_BUILD_VERSION;
    else process.env.APP_BUILD_VERSION = previous;
  }
});
