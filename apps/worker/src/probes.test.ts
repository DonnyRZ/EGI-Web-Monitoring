import assert from "node:assert/strict";
import test from "node:test";
import { isBrowserInfrastructureError, waitForVisualStability } from "./probes";

test("recognizes Chromium infrastructure failures", () => {
  assert.equal(
    isBrowserInfrastructureError("browserType.launch: Target page, context or browser has been closed"),
    true,
  );
  assert.equal(isBrowserInfrastructureError("page.goto: net::ERR_NAME_NOT_RESOLVED"), false);
});

test("visual stability waits for bounded network idle and final settle", async () => {
  const calls: string[] = [];
  await waitForVisualStability(
    {
      evaluate: async () => {
        calls.push("document");
        return undefined;
      },
      waitForLoadState: async (_state, options) => {
        calls.push(`network:${options.timeout}`);
        throw new Error("persistent analytics connection");
      },
      waitForTimeout: async (ms) => {
        calls.push(`settle:${ms}`);
      },
    },
    45_000,
  );

  assert.deepEqual(calls, ["document", "network:5000", "settle:1500"]);
});
