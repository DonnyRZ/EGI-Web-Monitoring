"use client";

import { Select } from "@/components/Select";
import { UserStoryStatusControls } from "@/components/user-stories/UserStoryStatusControls";
import type { TaskMonitoringFilters } from "@/lib/types";
import type { StoryStatusFilter } from "@/lib/user-story-status";

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Kritis" },
  { value: "high", label: "Tinggi" },
  { value: "medium", label: "Sedang" },
  { value: "low", label: "Rendah" },
];

export function UserStoryFilters({
  userRole,
  projects = [],
  developerFilters = [],
  statusGroup,
  projectId,
  developerId,
  priority,
  onStatusGroupChange,
  onProjectChange,
  onDeveloperChange,
  onPriorityChange,
}: {
  userRole: string;
  projects: Array<{ id: string; name: string }>;
  developerFilters: TaskMonitoringFilters["developers"];
  statusGroup: StoryStatusFilter;
  projectId: string;
  developerId: string;
  priority: string;
  onStatusGroupChange: (value: StoryStatusFilter) => void;
  onProjectChange: (value: string) => void;
  onDeveloperChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
}) {
  return (
    <section className="story-filter-panel panel" aria-label="Filter User Story">
      <div className="story-filter-grid">
        <UserStoryStatusControls
          id="story-status-filter"
          value={statusGroup}
          onChange={onStatusGroupChange}
          label="Status"
          menuMinWidth={180}
        />
        <div className="filter-field story-filter-field-project">
          <label htmlFor="story-project-filter">Project</label>
          <Select
            id="story-project-filter"
            value={projectId}
            onChange={onProjectChange}
            options={[
              { value: "", label: "Semua" },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
            aria-label={userRole === "developer" ? "Filter Project Saya" : "Filter Project"}
            className="block"
            menuMinWidth={180}
          />
        </div>
        <div className="filter-field story-filter-field-priority">
          <label htmlFor="story-priority-filter">Prioritas</label>
          <Select
            id="story-priority-filter"
            value={priority}
            onChange={onPriorityChange}
            options={[{ value: "", label: "Semua" }, ...PRIORITY_OPTIONS]}
            aria-label="Filter prioritas"
            className="block"
            menuMinWidth={180}
          />
        </div>
        {developerFilters.length > 0 ? (
          <div className="filter-field story-filter-field-developer">
            <label htmlFor="story-developer-filter">Developer</label>
            <Select
              id="story-developer-filter"
              value={developerId}
              onChange={onDeveloperChange}
              options={[
                { value: "", label: "Semua" },
                ...developerFilters.map((developer) => ({ value: developer.id, label: developer.name })),
              ]}
              aria-label="Filter developer"
              className="block"
              menuMinWidth={180}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
