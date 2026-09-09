"use client";

import Link from "next/link";
import { formatDateTime, initials } from "@/lib/format";
import { getUserStoryStatusGroup, USER_STORY_STATUS_GROUP_LABELS } from "@/lib/user-story-status";
import type { UserStory } from "@/lib/types";

export function UserStoryCard({
  story,
  compact = false,
  onOpenDetails,
}: {
  story: UserStory;
  compact?: boolean;
  onOpenDetails: (story: UserStory) => void;
}) {
  const statusGroup = getUserStoryStatusGroup(story.status);

  return (
    <article className={`story-card ${compact ? "compact" : ""} ${story.is_overdue ? "overdue" : ""}`}>
      <div className="story-card-top">
        <span className={`story-priority ${story.priority}`}>{story.priority}</span>
        {story.is_overdue ? <span className="overdue-label">Terlambat</span> : null}
      </div>
      <Link href={`/projects/${story.project_id}`} className="story-card-title-link">
        <h4>{story.title}</h4>
      </Link>
      <div className="story-card-context">
        {story.project?.name ? <span>{story.project.name}</span> : null}
        {story.website ? <span>{story.website.name}</span> : null}
        {story.tickets.length ? <span>{story.tickets.length} Task</span> : null}
      </div>
      <div className="story-card-assignees">
        {story.primary_developer ? (
          <span className="story-assignee">
            <span className="member-avatar">{initials(story.primary_developer.name)}</span>
            {story.primary_developer.name}
          </span>
        ) : <span className="muted">Belum ada developer utama</span>}
      </div>
      <div className="story-card-footer">
        <span className={`story-status-label story-status-group ${statusGroup}`}>
          {USER_STORY_STATUS_GROUP_LABELS[statusGroup]}
        </span>
        <span className="muted story-card-deadline">
          {story.due_date ? `Deadline ${formatDateTime(story.due_date)}` : "Tanpa deadline"}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-neutral story-card-detail-action"
          onClick={() => onOpenDetails(story)}
          aria-label={`Lihat detail User Story ${story.title}`}
        >
          Lihat detail
        </button>
      </div>
    </article>
  );
}
