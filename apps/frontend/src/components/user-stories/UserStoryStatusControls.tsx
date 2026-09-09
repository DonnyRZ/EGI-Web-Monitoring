"use client";

import { Select } from "@/components/Select";
import type { StoryStatusFilter } from "@/lib/user-story-status";
import { USER_STORY_STATUS_FILTERS } from "@/lib/user-story-status";

export function UserStoryStatusControls({
  id = "user-story-status-filter",
  label = "Status",
  value,
  onChange,
  className = "",
  menuMinWidth = 0,
}: {
  id?: string;
  label?: string;
  value: StoryStatusFilter;
  onChange: (value: StoryStatusFilter) => void;
  className?: string;
  menuMinWidth?: number;
}) {
  return (
    <div className={`filter-field story-status-controls ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      <Select
        id={id}
        value={value}
        onChange={(nextValue) => onChange(nextValue as StoryStatusFilter)}
        options={USER_STORY_STATUS_FILTERS}
        aria-label="Filter status pekerjaan User Story"
        className="block"
        menuMinWidth={menuMinWidth}
      />
    </div>
  );
}
