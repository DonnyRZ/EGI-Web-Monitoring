import assert from "node:assert/strict";
import test from "node:test";
import { TaskBusinessStatus } from "@egi/database";
import { aggregateTaskMonitoringRows, type TaskMonitoringOverviewRow } from "./task-monitoring.overview";

const from = new Date("2026-08-01T00:00:00.000Z");
const to = new Date("2026-08-31T23:59:59.999Z");

function row(overrides: Partial<TaskMonitoringOverviewRow> = {}): TaskMonitoringOverviewRow {
  return {
    project: { id: "project-1", name: "Project Satu", status: "active" },
    website: { id: "website-1" },
    status: TaskBusinessStatus.new,
    status_reason: "automatic",
    pic_developer: { id: "developer-1", name: "Developer Satu", email: "one@example.com" },
    developers: [{ id: "developer-1", name: "Developer Satu", email: "one@example.com" }],
    completed_at: null,
    is_overdue: false,
    needs_action: true,
    ...overrides,
  };
}

test("overview groups Project and Task Umum with business-friendly counts", () => {
  const result = aggregateTaskMonitoringRows([
    row(),
    row({ status: TaskBusinessStatus.in_progress, website: { id: "website-2" }, needs_action: false, developers: [{ id: "developer-2", name: "Developer Dua", email: "two@example.com" }] }),
    row({ status: TaskBusinessStatus.blocked, is_overdue: true }),
    row({ status: TaskBusinessStatus.done, completed_at: new Date("2026-08-20T10:00:00.000Z"), needs_action: false }),
    row({ project: null, website: null, pic_developer: null, developers: [], status_reason: "waiting_pic_developer" }),
  ], { completedFrom: from, completedTo: to });

  assert.equal(result.data.length, 2);
  assert.equal(result.data[0]?.project?.name, "Project Satu");
  assert.equal(result.data[0]?.active_count, 3);
  assert.equal(result.data[0]?.new_count, 1);
  assert.equal(result.data[0]?.in_progress_count, 1);
  assert.equal(result.data[0]?.blocked_count, 1);
  assert.equal(result.data[0]?.overdue_count, 1);
  assert.equal(result.data[0]?.completed_period_count, 1);
  assert.equal(result.data[0]?.attention_count, 2);
  assert.equal(result.data[0]?.developer_count, 2);
  assert.equal(result.data[1]?.project, null);
  assert.equal(result.data[1]?.key, "general");
  assert.equal(result.data[1]?.new_count, 1);
  assert.equal(result.data[1]?.unassigned_count, 1);
});

test("completed Project is hidden by default when its completion is outside the selected period", () => {
  const completed = row({ status: TaskBusinessStatus.done, completed_at: new Date("2026-08-20T10:00:00.000Z"), needs_action: false });
  const hidden = aggregateTaskMonitoringRows([completed], { completedFrom: from, completedTo: to });
  assert.equal(hidden.data.length, 0);
  assert.equal(hidden.summary.completed_period, 1);
  const completedOutsidePeriod = row({ status: TaskBusinessStatus.done, completed_at: new Date("2026-07-01T10:00:00.000Z"), needs_action: false });
  assert.equal(aggregateTaskMonitoringRows([completedOutsidePeriod], { completedFrom: from, completedTo: to }).data.length, 0);
  assert.equal(aggregateTaskMonitoringRows([completedOutsidePeriod], { completedFrom: from, completedTo: to, includeCompletedOutsidePeriod: true }).data.length, 1);
});

test("overview sorting puts blocked, overdue, then new work first", () => {
  const result = aggregateTaskMonitoringRows([
    row({ project: { id: "project-new", name: "New", status: "active" } }),
    row({ project: { id: "project-overdue", name: "Overdue", status: "active" }, status: TaskBusinessStatus.in_progress, is_overdue: true, needs_action: true }),
    row({ project: { id: "project-blocked", name: "Blocked", status: "active" }, status: TaskBusinessStatus.blocked }),
  ], { completedFrom: from, completedTo: to });

  assert.deepEqual(result.data.map((item) => item.project?.id), ["project-blocked", "project-overdue", "project-new"]);
});
