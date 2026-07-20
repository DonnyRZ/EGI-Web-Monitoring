import assert from "node:assert/strict";
import test from "node:test";
import { floorToMinute, isWebsiteDue } from "./scheduling";

test("floorToMinute creates one deterministic slot for all scheduler instances", () => {
  assert.equal(
    floorToMinute(new Date("2026-07-19T10:14:59.999Z")).toISOString(),
    "2026-07-19T10:14:00.000Z",
  );
});

test("a five-minute website is not enqueued every minute", () => {
  assert.equal(isWebsiteDue(new Date("2026-07-19T10:10:00.000Z"), 5), true);
  assert.equal(isWebsiteDue(new Date("2026-07-19T10:11:00.000Z"), 5), false);
});

test("a one-minute website remains due on every minute", () => {
  assert.equal(isWebsiteDue(new Date("2026-07-19T10:11:00.000Z"), 1), true);
});
