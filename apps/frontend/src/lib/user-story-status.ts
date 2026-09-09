import type { UserStoryStatus, UserStoryStatusGroup } from "@/lib/types";

export type StoryStatusFilter = "all" | UserStoryStatusGroup;

export const USER_STORY_STATUS_GROUP_ORDER: UserStoryStatusGroup[] = [
  "not_started",
  "active",
  "done",
  "blocked",
];

export const USER_STORY_STATUS_FILTERS: Array<{ value: StoryStatusFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "not_started", label: "Belum mulai" },
  { value: "active", label: "Berjalan" },
  { value: "done", label: "Selesai" },
  { value: "blocked", label: "Terhambat" },
];

export const USER_STORY_STATUS_GROUP_LABELS: Record<UserStoryStatusGroup, string> = {
  not_started: "Belum mulai",
  active: "Berjalan",
  done: "Selesai",
  blocked: "Terhambat",
};

/** Friendly labels are used only in the status editing context. */
export const USER_STORY_STATUS_LABELS: Record<UserStoryStatus, string> = {
  backlog: "Antrian",
  ready: "Siap dikerjakan",
  in_progress: "Sedang dikerjakan",
  review: "Menunggu review",
  done: "Selesai",
  blocked: "Terhambat",
};

export const ALL_USER_STORY_STATUSES: UserStoryStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
  "blocked",
];

export const DEVELOPER_EDITABLE_USER_STORY_STATUSES: UserStoryStatus[] = [
  "in_progress",
  "review",
  "done",
  "blocked",
];

const USER_STORY_STATUS_GROUP_STATUSES: Record<UserStoryStatusGroup, UserStoryStatus[]> = {
  not_started: ["backlog", "ready"],
  active: ["in_progress", "review"],
  done: ["done"],
  blocked: ["blocked"],
};

export function getUserStoryStatusGroup(status: UserStoryStatus): UserStoryStatusGroup {
  return USER_STORY_STATUS_GROUP_ORDER.find((group) => USER_STORY_STATUS_GROUP_STATUSES[group].includes(status))
    ?? "not_started";
}

export function getUserStoryStatusGroupLabel(status: UserStoryStatus) {
  return USER_STORY_STATUS_GROUP_LABELS[getUserStoryStatusGroup(status)];
}

export function statusesForUserStoryGroup(group: UserStoryStatusGroup): UserStoryStatus[] {
  return USER_STORY_STATUS_GROUP_STATUSES[group];
}

export function statusGroupQueryValue(filter: StoryStatusFilter): UserStoryStatusGroup | undefined {
  return filter === "all" ? undefined : filter;
}

export function isStoryInStatusFilter(status: UserStoryStatus, filter: StoryStatusFilter) {
  return filter === "all" || getUserStoryStatusGroup(status) === filter;
}
