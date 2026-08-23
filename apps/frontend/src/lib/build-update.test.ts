import assert from "node:assert/strict";
import { test } from "node:test";
import { getBuildUpdateAction } from "./build-update";

test("matching build versions do not trigger an update", () => {
  assert.equal(getBuildUpdateAction("abc", "abc", false, null), "none");
});

test("a clean page reloads once for a new build", () => {
  assert.equal(getBuildUpdateAction("old", "new", false, null), "reload");
});

test("a dirty page keeps the update visible instead of reloading", () => {
  assert.equal(getBuildUpdateAction("old", "new", true, null), "banner");
});

test("the session guard prevents a reload loop", () => {
  assert.equal(getBuildUpdateAction("old", "new", false, "new"), "banner");
});

test("development and invalid versions are ignored safely", () => {
  assert.equal(getBuildUpdateAction("development", "new", false, null), "none");
  assert.equal(getBuildUpdateAction("old", "development", false, null), "none");
  assert.equal(getBuildUpdateAction("old", "", false, null), "none");
});
