import type { ProjectAssignments, ProjectRosterCandidate } from "./types";

export type RosterFilter = "all" | "selected" | "overdue";

export interface AssignmentChanges {
  picWebAdded: number;
  picWebRemoved: number;
  developerAdded: number;
  developerRemoved: number;
  picDeveloperChanged: boolean;
  total: number;
}

export function normalizeIds(ids: string[]) {
  return [...new Set(ids)].sort();
}

export function normalizeAssignments(value: ProjectAssignments): ProjectAssignments {
  return {
    pic_web_ids: normalizeIds(value.pic_web_ids),
    pic_developer_id: value.pic_developer_id || null,
    developer_ids: normalizeIds(value.developer_ids),
  };
}

export function toggleAssignmentId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

export function filterRoster(
  rows: ProjectRosterCandidate[],
  query: string,
  filter: RosterFilter,
  selectedIds: string[],
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selected = new Set(selectedIds);

  return rows
    .filter((row) => {
      if (!normalizedQuery) return true;
      return `${row.name} ${row.email}`.toLocaleLowerCase().includes(normalizedQuery);
    })
    .filter((row) => {
      if (filter === "selected") return selected.has(row.id);
      if (filter === "overdue") return row.overdue_workload > 0;
      return true;
    })
    .sort((a, b) => {
      const selectedOrder = Number(selected.has(b.id)) - Number(selected.has(a.id));
      if (selectedOrder !== 0) return selectedOrder;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

export function getAssignmentChanges(before: ProjectAssignments, after: ProjectAssignments): AssignmentChanges {
  const previous = normalizeAssignments(before);
  const next = normalizeAssignments(after);
  const countAdded = (from: string[], to: string[]) => to.filter((id) => !from.includes(id)).length;
  const countRemoved = (from: string[], to: string[]) => from.filter((id) => !to.includes(id)).length;
  const picDeveloperChanged = previous.pic_developer_id !== next.pic_developer_id;

  return {
    picWebAdded: countAdded(previous.pic_web_ids, next.pic_web_ids),
    picWebRemoved: countRemoved(previous.pic_web_ids, next.pic_web_ids),
    developerAdded: countAdded(previous.developer_ids, next.developer_ids),
    developerRemoved: countRemoved(previous.developer_ids, next.developer_ids),
    picDeveloperChanged,
    total:
      countAdded(previous.pic_web_ids, next.pic_web_ids) +
      countRemoved(previous.pic_web_ids, next.pic_web_ids) +
      countAdded(previous.developer_ids, next.developer_ids) +
      countRemoved(previous.developer_ids, next.developer_ids) +
      Number(picDeveloperChanged),
  };
}
