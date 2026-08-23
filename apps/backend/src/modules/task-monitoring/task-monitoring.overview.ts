import { TaskBusinessStatus } from "@egi/database";

type OverviewUser = { id: string; name: string; email: string };

export interface TaskMonitoringOverviewRow {
  project: { id: string; name: string; status: "draft" | "active" | "archived" } | null;
  website: { id: string } | null;
  status: TaskBusinessStatus;
  status_reason: "automatic" | "manual_override" | "waiting_pic_developer" | "legacy_task";
  pic_developer: OverviewUser | null;
  developers: OverviewUser[];
  completed_at: Date | null;
  is_overdue: boolean;
  needs_action: boolean;
}

export interface TaskMonitoringOverviewOptions {
  completedFrom: Date;
  completedTo: Date;
  includeCompletedOutsidePeriod?: boolean;
}

function isWithinPeriod(value: Date | null, from: Date, to: Date) {
  return Boolean(value && value >= from && value <= to);
}

export function aggregateTaskMonitoringRows(
  rows: TaskMonitoringOverviewRow[],
  options: TaskMonitoringOverviewOptions,
) {
  const groups = new Map<string, {
    key: string;
    project: TaskMonitoringOverviewRow["project"];
    websiteIds: Set<string>;
    developerIds: Set<string>;
    active_count: number;
    new_count: number;
    in_progress_count: number;
    blocked_count: number;
    overdue_count: number;
    completed_period_count: number;
    attention_count: number;
    unassigned_count: number;
    pic_developer: OverviewUser | null;
    has_done: boolean;
  }>();

  for (const row of rows) {
    const key = row.project?.id ?? "general";
    const group = groups.get(key) ?? {
      key,
      project: row.project,
      websiteIds: new Set<string>(),
      developerIds: new Set<string>(),
      active_count: 0,
      new_count: 0,
      in_progress_count: 0,
      blocked_count: 0,
      overdue_count: 0,
      completed_period_count: 0,
      attention_count: 0,
      unassigned_count: 0,
      pic_developer: row.pic_developer,
      has_done: false,
    };

    if (row.website) group.websiteIds.add(row.website.id);
    for (const developer of row.developers) group.developerIds.add(developer.id);
    if (!group.pic_developer && row.pic_developer) group.pic_developer = row.pic_developer;

    if (row.status !== TaskBusinessStatus.done) group.active_count += 1;
    if (row.status === TaskBusinessStatus.new || row.status === TaskBusinessStatus.waiting_pic) group.new_count += 1;
    if (row.status === TaskBusinessStatus.in_progress) group.in_progress_count += 1;
    if (row.status === TaskBusinessStatus.blocked) group.blocked_count += 1;
    if (row.is_overdue) group.overdue_count += 1;
    if (row.needs_action) group.attention_count += 1;
    if (row.status_reason === "waiting_pic_developer" || !row.pic_developer) group.unassigned_count += 1;
    if (row.status === TaskBusinessStatus.done) {
      group.has_done = true;
      if (isWithinPeriod(row.completed_at, options.completedFrom, options.completedTo)) {
        group.completed_period_count += 1;
      }
    }

    groups.set(key, group);
  }

  const allGroups = [...groups.values()];
  const data = allGroups
    .filter((group) => group.active_count > 0 || (options.includeCompletedOutsidePeriod && group.has_done))
    .map((group) => ({
      key: group.key,
      project: group.project,
      website_count: group.websiteIds.size,
      active_count: group.active_count,
      new_count: group.new_count,
      in_progress_count: group.in_progress_count,
      blocked_count: group.blocked_count,
      overdue_count: group.overdue_count,
      completed_period_count: group.completed_period_count,
      attention_count: group.attention_count,
      unassigned_count: group.unassigned_count,
      developer_count: group.developerIds.size,
      pic_developer: group.pic_developer,
    }));

  data.sort((a, b) => {
    if (a.blocked_count !== b.blocked_count) return b.blocked_count - a.blocked_count;
    if (a.overdue_count !== b.overdue_count) return b.overdue_count - a.overdue_count;
    if (a.new_count !== b.new_count) return b.new_count - a.new_count;
    if (a.active_count !== b.active_count) return b.active_count - a.active_count;
    return (a.project?.name ?? "Task Umum").localeCompare(b.project?.name ?? "Task Umum");
  });

  return {
    data,
    summary: {
      projects: data.length,
      active: data.reduce((total, group) => total + group.active_count, 0),
      new: data.reduce((total, group) => total + group.new_count, 0),
      in_progress: data.reduce((total, group) => total + group.in_progress_count, 0),
      blocked: data.reduce((total, group) => total + group.blocked_count, 0),
      overdue: data.reduce((total, group) => total + group.overdue_count, 0),
      completed_period: allGroups.reduce((total, group) => total + group.completed_period_count, 0),
      attention_projects: data.filter((group) => group.attention_count > 0).length,
    },
  };
}
