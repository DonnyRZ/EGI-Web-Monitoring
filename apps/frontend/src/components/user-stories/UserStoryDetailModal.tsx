"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBodyScrollLock, useDialogFocus } from "@/components/ResponsiveOverlay";
import { ErrorBanner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDateTime, initials } from "@/lib/format";
import {
  ALL_USER_STORY_STATUSES,
  DEVELOPER_EDITABLE_USER_STORY_STATUSES,
  getUserStoryStatusGroup,
  USER_STORY_STATUS_GROUP_LABELS,
  USER_STORY_STATUS_LABELS,
} from "@/lib/user-story-status";
import { userStoriesApi } from "@/lib/api-services";
import type { UserStory, UserStoryStatus } from "@/lib/types";

export function UserStoryDetailModal({
  story,
  canEditStatus,
  canManageStatus,
  onClose,
  onSaved,
}: {
  story: UserStory | null;
  canEditStatus: boolean;
  canManageStatus: boolean;
  onClose: () => void;
  onSaved: (story: UserStory) => Promise<void> | void;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState<UserStoryStatus>("backlog");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!story) return;
    setStatus(story.status);
    setError("");
  }, [story?.id, story?.status]);

  const requestClose = useCallback(() => {
    if (!saving) onClose();
  }, [onClose, saving]);

  useBodyScrollLock(Boolean(story));
  useDialogFocus(Boolean(story), modalRef, undefined, requestClose, closeRef);

  if (!story) return null;

  const currentStory = story;
  const statusOptions = canManageStatus ? ALL_USER_STORY_STATUSES : DEVELOPER_EDITABLE_USER_STORY_STATUSES;
  const statusGroup = getUserStoryStatusGroup(story.status);

  async function saveStatus() {
    if (!canEditStatus || status === currentStory.status || saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await userStoriesApi.update(currentStory.id, { status });
      await onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status User Story");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop story-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div ref={modalRef} className="modal story-detail-modal" role="dialog" aria-modal="true" aria-labelledby="user-story-detail-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <header className="story-detail-header">
          <div className="story-detail-heading">
            <span className="modal-kicker">User Story</span>
            <h2 id="user-story-detail-title">{story.title}</h2>
            <Link href={`/projects/${story.project_id}`} className="story-detail-project-link" onClick={requestClose}>
              {story.project?.name || "Buka Project"} ↗
            </Link>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={requestClose} aria-label="Tutup detail User Story">×</button>
        </header>

        {error ? <ErrorBanner message={error} /> : null}

        <div className="story-detail-overview">
          <span className={`story-status-label story-status-group ${statusGroup}`}>{USER_STORY_STATUS_GROUP_LABELS[statusGroup]}</span>
          <span className={`story-priority ${story.priority}`}>{story.priority}</span>
          {story.is_overdue ? <span className="overdue-label">Terlambat</span> : null}
        </div>

        <dl className="story-detail-facts">
          <DetailFact label="Website" value={story.website ? `${story.website.name} · ${story.website.domain}` : "Seluruh Project"} />
          <DetailFact label="Developer utama" value={story.primary_developer?.name || "Belum ditentukan"} avatar={story.primary_developer?.name} />
          <DetailFact label="Deadline" value={story.due_date ? formatDateTime(story.due_date) : "Tanpa deadline"} />
          <DetailFact label="Task terkait" value={story.tickets.length ? `${story.tickets.length} Task` : "Tidak ada Task terkait"} />
        </dl>

        <div className="story-detail-copy-grid">
          <DetailCopy label="Deskripsi" value={story.description} empty="Tidak ada deskripsi." />
          <DetailCopy label="Acceptance criteria" value={story.acceptance_criteria} empty="Belum ada acceptance criteria." />
        </div>

        <section className="story-detail-section" aria-labelledby="story-detail-collaborators">
          <h3 id="story-detail-collaborators">Collaborator</h3>
          {story.collaborators.length ? <div className="story-detail-members">{story.collaborators.map((member) => <span className="story-detail-member" key={member.id}><span className="member-avatar">{initials(member.name)}</span>{member.name}</span>)}</div> : <p className="muted">Tidak ada collaborator.</p>}
        </section>

        {canEditStatus ? (
          <fieldset className="story-status-editor">
            <legend>Status pekerjaan</legend>
            <p className="story-detail-current-status">Status saat ini: <strong>{USER_STORY_STATUS_LABELS[story.status]}</strong></p>
            <div className="story-status-options" role="radiogroup" aria-label="Pilih status pekerjaan">
              {statusOptions.map((option) => {
                const optionId = `story-${story.id}-status-${option}`;
                return (
                  <label className={`story-status-option ${status === option ? "selected" : ""}`} htmlFor={optionId} key={option}>
                    <input id={optionId} type="radio" name={`story-${story.id}-status`} value={option} checked={status === option} onChange={() => setStatus(option)} disabled={saving} />
                    <span>{USER_STORY_STATUS_LABELS[option]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <section className="story-detail-section story-detail-readonly" aria-labelledby="story-detail-readonly-status">
            <h3 id="story-detail-readonly-status">Status pekerjaan</h3>
            <p className="muted">{USER_STORY_STATUS_LABELS[story.status]}</p>
          </section>
        )}

        <p className="story-detail-live" aria-live="polite">{saving ? "Menyimpan status…" : ""}</p>
        <footer className="modal-actions story-detail-actions">
          <button type="button" className="btn" onClick={requestClose} disabled={saving}>{canEditStatus ? "Batal" : "Tutup"}</button>
          {canEditStatus ? <button type="button" className="btn btn-primary" onClick={() => void saveStatus()} disabled={saving || status === story.status}>{saving ? "Menyimpan…" : "Simpan status"}</button> : null}
        </footer>
      </div>
    </div>
  );
}

function DetailFact({ label, value, avatar }: { label: string; value: string; avatar?: string }) {
  return <div className="story-detail-fact"><dt>{label}</dt><dd>{avatar ? <span className="story-detail-fact-person"><span className="member-avatar">{initials(avatar)}</span>{value}</span> : value}</dd></div>;
}

function DetailCopy({ label, value, empty }: { label: string; value: string | null; empty: string }) {
  return <section className="story-detail-section"><h3>{label}</h3><p className={value ? "story-detail-long-copy" : "muted"}>{value || empty}</p></section>;
}
