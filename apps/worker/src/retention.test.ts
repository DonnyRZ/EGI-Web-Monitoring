import assert from "node:assert/strict";
import test from "node:test";
import { readRetentionDays } from "./retention";

test("uses defaults and accepts bounded positive retention periods", () => {
  assert.equal(readRetentionDays("RESULTS", 90, {}), 90);
  assert.equal(readRetentionDays("RESULTS", 90, { RESULTS: "1" }), 1);
  assert.equal(readRetentionDays("RESULTS", 90, { RESULTS: "3650" }), 3650);
});

test("rejects retention values that could delete active data", () => {
  for (const value of ["0", "-1", "1.5", "NaN", "3651"]) {
    assert.throws(() => readRetentionDays("RESULTS", 90, { RESULTS: value }));
  }
});
