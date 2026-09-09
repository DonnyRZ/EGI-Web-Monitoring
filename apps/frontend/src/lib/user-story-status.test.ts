import assert from "node:assert/strict";
import test from "node:test";
import {
  getUserStoryStatusGroup,
  isStoryInStatusFilter,
  USER_STORY_STATUS_GROUP_LABELS,
  USER_STORY_STATUS_LABELS,
  statusesForUserStoryGroup,
} from "./user-story-status";
import { UserStoryStatusGroup } from "@egi/shared-types";

test("maps every operational status to one simple browsing group", () => {
  assert.equal(getUserStoryStatusGroup("backlog"), UserStoryStatusGroup.not_started);
  assert.equal(getUserStoryStatusGroup("ready"), UserStoryStatusGroup.not_started);
  assert.equal(getUserStoryStatusGroup("in_progress"), UserStoryStatusGroup.active);
  assert.equal(getUserStoryStatusGroup("review"), UserStoryStatusGroup.active);
  assert.equal(getUserStoryStatusGroup("done"), UserStoryStatusGroup.done);
  assert.equal(getUserStoryStatusGroup("blocked"), UserStoryStatusGroup.blocked);
});

test("keeps group labels simple while preserving friendly edit labels", () => {
  assert.deepEqual(Object.values(USER_STORY_STATUS_GROUP_LABELS), ["Belum mulai", "Berjalan", "Selesai", "Terhambat"]);
  assert.equal(USER_STORY_STATUS_LABELS.backlog, "Antrian");
  assert.equal(USER_STORY_STATUS_LABELS.review, "Menunggu review");
});

test("returns the exact statuses represented by each browsing group", () => {
  assert.deepEqual(statusesForUserStoryGroup(UserStoryStatusGroup.not_started), ["backlog", "ready"]);
  assert.deepEqual(statusesForUserStoryGroup(UserStoryStatusGroup.active), ["in_progress", "review"]);
  assert.deepEqual(statusesForUserStoryGroup(UserStoryStatusGroup.done), ["done"]);
  assert.deepEqual(statusesForUserStoryGroup(UserStoryStatusGroup.blocked), ["blocked"]);
});

test("matches an all filter and grouped filters without client-side status aliases", () => {
  assert.equal(isStoryInStatusFilter("blocked", "all"), true);
  assert.equal(isStoryInStatusFilter("review", UserStoryStatusGroup.active), true);
  assert.equal(isStoryInStatusFilter("ready", UserStoryStatusGroup.active), false);
});
