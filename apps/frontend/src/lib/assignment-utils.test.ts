import assert from "node:assert/strict";
import test from "node:test";
import { filterRoster, getAssignmentChanges, normalizeAssignments, toggleAssignmentId } from "./assignment-utils";
import type { ProjectAssignments, ProjectRosterCandidate } from "./types";

const rows: ProjectRosterCandidate[] = [
  { id: "1", name: "Budi", email: "budi@example.com", role: "developer", is_active: true, active_workload: 2, overdue_workload: 0 },
  { id: "2", name: "Donny", email: "donny@example.com", role: "developer", is_active: true, active_workload: 1, overdue_workload: 1 },
  { id: "3", name: "Fasya", email: "fasya@example.com", role: "developer", is_active: true, active_workload: 0, overdue_workload: 0 },
];

test("assignment ids are toggled without duplicate values", () => {
  assert.deepEqual(toggleAssignmentId(["1", "2"], "2"), ["1"]);
  assert.deepEqual(toggleAssignmentId(["1"], "2"), ["1", "2"]);
  assert.deepEqual(normalizeAssignments({ pic_web_ids: ["2", "1", "2"], pic_developer_id: "", developer_ids: ["3", "3"] }), {
    pic_web_ids: ["1", "2"],
    pic_developer_id: null,
    developer_ids: ["3"],
  });
});

test("roster search, filters, and selected-first sorting work together", () => {
  assert.deepEqual(filterRoster(rows, "donny", "all", []).map((row) => row.id), ["2"]);
  assert.deepEqual(filterRoster(rows, "", "selected", ["3", "1"]).map((row) => row.id), ["1", "3"]);
  assert.deepEqual(filterRoster(rows, "", "overdue", []).map((row) => row.id), ["2"]);
  assert.deepEqual(filterRoster(rows, "", "all", ["3"]).map((row) => row.id), ["3", "1", "2"]);
});

test("assignment changes are order-insensitive and summarized", () => {
  const before: ProjectAssignments = { pic_web_ids: ["1"], pic_developer_id: "2", developer_ids: ["2", "3"] };
  const after: ProjectAssignments = { pic_web_ids: ["1", "4"], pic_developer_id: "3", developer_ids: ["3", "5"] };
  assert.deepEqual(getAssignmentChanges(before, after), {
    picWebAdded: 1,
    picWebRemoved: 0,
    developerAdded: 1,
    developerRemoved: 1,
    picDeveloperChanged: true,
    total: 4,
  });
});
