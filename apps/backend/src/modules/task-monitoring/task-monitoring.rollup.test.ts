import assert from "node:assert/strict";
import test from "node:test";
import { TaskBusinessStatus, TicketStatus, UserStoryStatus } from "@egi/database";
import { isTaskOverdue, needsTaskAction, rollupTaskStatus } from "./task-monitoring.rollup";

test("manual status override wins over automatic story rollup", () => {
  assert.equal(rollupTaskStatus({
    override: TaskBusinessStatus.done,
    ticketStatus: TicketStatus.open,
    hasPicDeveloper: true,
    storyStatuses: [UserStoryStatus.blocked],
  }), TaskBusinessStatus.done);
});

test("blocked has priority over in-progress and backlog stories", () => {
  assert.equal(rollupTaskStatus({
    override: null,
    ticketStatus: TicketStatus.open,
    hasPicDeveloper: true,
    storyStatuses: [UserStoryStatus.ready, UserStoryStatus.in_progress, UserStoryStatus.blocked],
  }), TaskBusinessStatus.blocked);
});

test("multiple stories are done only when every story is done", () => {
  assert.equal(rollupTaskStatus({ override: null, ticketStatus: TicketStatus.open, hasPicDeveloper: true, storyStatuses: [UserStoryStatus.done, UserStoryStatus.done] }), TaskBusinessStatus.done);
  assert.equal(rollupTaskStatus({ override: null, ticketStatus: TicketStatus.open, hasPicDeveloper: true, storyStatuses: [UserStoryStatus.done, UserStoryStatus.ready] }), TaskBusinessStatus.new);
});

test("an open task without a PIC Developer waits for technical ownership", () => {
  assert.equal(rollupTaskStatus({ override: null, ticketStatus: TicketStatus.open, hasPicDeveloper: false, storyStatuses: [] }), TaskBusinessStatus.waiting_pic);
});

test("legacy terminal ticket status is done and does not become overdue", () => {
  const yesterday = new Date("2026-08-17T00:00:00.000Z");
  assert.equal(rollupTaskStatus({ override: null, ticketStatus: TicketStatus.closed, hasPicDeveloper: true, storyStatuses: [] }), TaskBusinessStatus.done);
  assert.equal(isTaskOverdue(TaskBusinessStatus.done, yesterday, new Date("2026-08-18T00:00:00.000Z")), false);
  assert.equal(needsTaskAction(TaskBusinessStatus.done, true), false);
});
