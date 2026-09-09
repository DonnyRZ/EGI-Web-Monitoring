"use client";

import type { StoryStatusFilter } from "@/lib/user-story-status";
import { USER_STORY_STATUS_FILTERS } from "@/lib/user-story-status";

export function UserStoryStatusControls({
  value,
  onChange,
}: {
  value: StoryStatusFilter;
  onChange: (value: StoryStatusFilter) => void;
}) {
  return (
    <div className="story-status-controls" role="toolbar" aria-label="Tampilkan User Story berdasarkan status">
      <span className="filter-field-label">Status pekerjaan</span>
      <div className="story-status-control-list">
        {USER_STORY_STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`story-status-control ${value === filter.value ? "active" : ""}`}
            aria-pressed={value === filter.value}
            onClick={() => onChange(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
