"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { projectsApi } from "@/lib/api-services";
import { initials } from "@/lib/format";
import { getAssignmentChanges, filterRoster, normalizeAssignments, toggleAssignmentId, type RosterFilter } from "@/lib/assignment-utils";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import type { Project, ProjectAssignments, ProjectRosterCandidate, UserRole, UserSummary } from "@/lib/types";

type PickerMode = "multi" | "single";
type PickerKind = "pic_web" | "developer_team" | "pic_developer";

interface AssignmentWorkspaceProps {
  project: Project;
  onSaved: (project: Project, message: string) => void;
}

type AssignmentMember = ProjectRosterCandidate;

interface MemberPickerDrawerProps {
  title: string;
  description: string;
  rows: AssignmentMember[];
  selectedIds: string[];
  mode: PickerMode;
  kind: PickerKind;
  onApply: (ids: string[]) => void;
  onClose: () => void;
}

export function AssignmentWorkspace({ project, onSaved }: AssignmentWorkspaceProps) {
  const [picWebRoster, setPicWebRoster] = useState<ProjectRosterCandidate[]>([]);
  const [developerRoster, setDeveloperRoster] = useState<ProjectRosterCandidate[]>([]);
  const [draft, setDraft] = useState<ProjectAssignments>(() => createInitialAssignments(project));
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([projectsApi.roster("pic_web"), projectsApi.roster("developer")])
      .then(([picWebRows, developerRows]) => {
        if (cancelled) return;
        setPicWebRoster(picWebRows);
        setDeveloperRoster(developerRows);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Gagal memuat roster assignment");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persisted = useMemo(() => createInitialAssignments(project), [project]);
  const dirty = JSON.stringify(normalizeAssignments(draft)) !== JSON.stringify(normalizeAssignments(persisted));
  const changes = useMemo(() => getAssignmentChanges(persisted, draft), [persisted, draft]);
  const picWebRows = useMemo(() => mergeAssignedRows(picWebRoster, project.pic_web, "pic_web", draft.pic_web_ids), [picWebRoster, project.pic_web, draft.pic_web_ids]);
  const developerRows = useMemo(() => {
    const assigned = project.developers.slice();
    if (project.pic_developer) assigned.push(project.pic_developer);
    return mergeAssignedRows(developerRoster, assigned, "developer", draft.developer_ids.concat(project.pic_developer_id ? [project.pic_developer_id] : []));
  }, [developerRoster, project.developers, project.pic_developer, project.pic_developer_id, draft.developer_ids]);
  const selectedPicWeb = useMemo(() => picWebRows.filter((row) => draft.pic_web_ids.includes(row.id)), [picWebRows, draft.pic_web_ids]);
  const selectedDevelopers = useMemo(() => developerRows.filter((row) => draft.developer_ids.includes(row.id)), [developerRows, draft.developer_ids]);
  const picDeveloper = developerRows.find((row) => row.id === draft.pic_developer_id) ?? null;
  const activeWorkload = selectedDevelopers.reduce((total, row) => total + row.active_workload, 0);
  const overdueWorkload = selectedDevelopers.reduce((total, row) => total + row.overdue_workload, 0);
  const removedDevelopers = project.developers.filter((member) => !draft.developer_ids.includes(member.id));
  const closePicker = useCallback(() => setPicker(null), []);

  useUnsavedChanges(`projects:${project.id}:assignments`, dirty);

  function openPicker(kind: PickerKind) {
    setPicker(kind);
    setError("");
  }

  function updateMulti(field: "pic_web_ids" | "developer_ids", ids: string[]) {
    setDraft((current) => ({ ...current, [field]: normalizeAssignments({ ...current, [field]: ids })[field] }));
  }

  function removeMember(field: "pic_web_ids" | "developer_ids", id: string) {
    setDraft((current) => ({ ...current, [field]: current[field].filter((value) => value !== id) }));
  }

  function resetDraft() {
    setDraft(persisted);
    setWarning("");
    setError("");
  }

  async function performSave() {
    setSaving(true);
    setError("");
    setWarning("");
    try {
      const response = await projectsApi.updateAssignments(project.id, normalizeAssignments(draft));
      const message = response.warnings?.join(" ") || "Assignment Project disimpan.";
      setWarning(response.warnings?.join(" ") || "");
      setConfirmRemoval(false);
      onSaved(response, message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan assignment");
    } finally {
      setSaving(false);
    }
  }

  function requestSave() {
    if (!dirty || saving) return;
    if (removedDevelopers.length > 0 && project.active_stories_count > 0) {
      setConfirmRemoval(true);
      return;
    }
    void performSave();
  }

  if (loading) return <LoadingState label="Memuat roster assignment…" />;

  return (
    <section className="assignment-workspace">
      <div className="assignment-intro">
        <div>
          <span className="eyebrow">Project configuration</span>
          <h3>PIC &amp; Assignment</h3>
        </div>
        <span className="assignment-rule">Perubahan disimpan sekaligus</span>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {warning ? <div className="warning-banner">{warning}</div> : null}

      <div className="assignment-layout">
        <AssignmentCard
          className="assignment-card-pic-web"
          eyebrow="Non-teknis"
          title="PIC Web"
          description="Memantau masalah dan membuat Task untuk Project ini."
          count={draft.pic_web_ids.length}
          countLabel="orang"
          actionLabel="Kelola PIC Web"
          onAction={() => openPicker("pic_web")}
        >
          <SelectedMemberSummary
            members={selectedPicWeb}
            empty="Belum ada PIC Web. Tambahkan minimal satu penanggung jawab bila Project mulai dipantau."
            onRemove={(id) => removeMember("pic_web_ids", id)}
            removeLabel="Hapus PIC Web"
          />
        </AssignmentCard>

        <AssignmentCard
          className="assignment-card-pic-developer"
          eyebrow="Tech lead"
          title="PIC Developer"
          description="Satu PIC teknis yang memimpin triase dan User Story Project ini."
          count={draft.pic_developer_id ? 1 : 0}
          countLabel="orang"
          actionLabel={picDeveloper ? "Ganti PIC Developer" : "Pilih PIC Developer"}
          onAction={() => openPicker("pic_developer")}
        >
          {picDeveloper ? (
            <div className="assignment-single-member">
              <MemberIdentity member={picDeveloper} />
              <div className="assignment-single-meta">
                <WorkloadSummary member={picDeveloper} />
                <button type="button" className="text-link assignment-clear-link" onClick={() => setDraft((current) => ({ ...current, pic_developer_id: null }))}>
                  Hapus PIC Developer
                </button>
              </div>
            </div>
          ) : (
            <div className="assignment-empty-state">
              <span className="assignment-empty-icon" aria-hidden="true">+</span>
              <div>
                <strong>Belum ditentukan</strong>
                <p>PIC Developer bersifat opsional dan dapat ditambahkan saat Project siap ditangani tim teknis.</p>
              </div>
            </div>
          )}
          <p className="assignment-help">PIC Developer harus memiliki role global Developer. Ia tidak otomatis masuk Developer Team.</p>
        </AssignmentCard>

        <AssignmentCard
          className="assignment-card-developer-team"
          eyebrow="Eksekusi teknis"
          title="Developer Team"
          description="Developer yang dapat menerima dan mengerjakan User Story di Project ini."
          count={draft.developer_ids.length}
          countLabel="anggota"
          actionLabel="Kelola Developer Team"
          onAction={() => openPicker("developer_team")}
          wide
        >
          <div className="developer-team-summary">
            <SelectedMemberSummary
              members={selectedDevelopers}
              empty="Belum ada developer team. Tambahkan anggota agar User Story dapat ditugaskan."
              onRemove={(id) => removeMember("developer_ids", id)}
              removeLabel="Hapus developer dari team"
            />
            <div className="developer-team-workload" aria-label="Ringkasan workload developer team">
              <div><strong>{activeWorkload}</strong><span>pekerjaan aktif</span></div>
              <div className={overdueWorkload > 0 ? "has-overdue" : ""}><strong>{overdueWorkload}</strong><span>overdue</span></div>
            </div>
          </div>
          {picDeveloper && draft.developer_ids.includes(picDeveloper.id) ? <div className="assignment-note"><strong>{picDeveloper.name}</strong> memegang dua tanggung jawab: PIC Developer dan anggota Developer Team.</div> : null}
        </AssignmentCard>
      </div>

      <div className={`sticky-save-bar ${dirty ? "visible" : ""}`}>
        <span>
          <strong>Perubahan belum disimpan</strong>
          <small>{changes.total} perubahan assignment siap ditinjau sebelum disimpan.</small>
        </span>
        <div className="row-actions">
          <button type="button" className="btn" onClick={resetDraft} disabled={saving}>Batalkan perubahan</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={requestSave}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</button>
        </div>
      </div>

      {picker === "pic_web" ? <MemberPickerDrawer title="Kelola PIC Web" description="Pilih satu atau beberapa PIC Web yang memantau kebutuhan Project ini." rows={picWebRows} selectedIds={draft.pic_web_ids} mode="multi" kind="pic_web" onApply={(ids) => { updateMulti("pic_web_ids", ids); closePicker(); }} onClose={closePicker} /> : null}
      {picker === "developer_team" ? <MemberPickerDrawer title="Kelola Developer Team" description="Pilih developer yang dapat menerima dan mengerjakan User Story Project ini." rows={developerRows} selectedIds={draft.developer_ids} mode="multi" kind="developer_team" onApply={(ids) => { updateMulti("developer_ids", ids); closePicker(); }} onClose={closePicker} /> : null}
      {picker === "pic_developer" ? <MemberPickerDrawer title="Pilih PIC Developer" description="Tentukan satu tech lead untuk triase Task dan memimpin User Story Project ini." rows={developerRows} selectedIds={draft.pic_developer_id ? [draft.pic_developer_id] : []} mode="single" kind="pic_developer" onApply={(ids) => { setDraft((current) => ({ ...current, pic_developer_id: ids[0] ?? null })); closePicker(); }} onClose={closePicker} /> : null}

      {confirmRemoval ? <AssignmentRemovalDialog members={removedDevelopers} onCancel={() => setConfirmRemoval(false)} onConfirm={() => { setConfirmRemoval(false); void performSave(); }} /> : null}
    </section>
  );
}

function AssignmentCard({ eyebrow, title, description, count, countLabel, actionLabel, onAction, children, className = "", wide = false }: { eyebrow: string; title: string; description: string; count: number; countLabel: string; actionLabel: string; onAction: () => void; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <section className={`assignment-card panel ${wide ? "assignment-card-wide" : ""} ${className}`.trim()}>
      <div className="assignment-card-header">
        <div>
          <span className="assignment-card-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
        <span className="assignment-count" aria-label={`${count} ${countLabel}`}><strong>{count}</strong><small>{countLabel}</small></span>
      </div>
      <div className="assignment-card-content">{children}</div>
      <button type="button" className="btn btn-sm btn-neutral assignment-card-action" onClick={onAction}>{actionLabel}</button>
    </section>
  );
}

function SelectedMemberSummary({ members, empty, onRemove, removeLabel }: { members: AssignmentMember[]; empty: string; onRemove: (id: string) => void; removeLabel: string }) {
  if (!members.length) {
    return <div className="assignment-empty-state assignment-empty-state-compact"><span className="assignment-empty-icon" aria-hidden="true">+</span><p>{empty}</p></div>;
  }
  const visible = members.slice(0, 4);
  return (
    <div className="selected-member-summary">
      <div className="selected-member-chips" aria-label={`${members.length} anggota terpilih`}>
        {visible.map((member) => <button key={member.id} type="button" className="selected-member-chip" onClick={() => onRemove(member.id)} aria-label={`${removeLabel}: ${member.name}`} title={`${removeLabel}: ${member.name}`}><span className="member-avatar">{initials(member.name)}</span><span>{member.name}</span><span className="chip-remove" aria-hidden="true">×</span></button>)}
        {members.length > visible.length ? <span className="selected-member-more">+{members.length - visible.length} anggota lain</span> : null}
      </div>
      <p className="selected-member-hint">Klik nama untuk menghapus langsung. Gunakan tombol kelola untuk melihat seluruh anggota.</p>
    </div>
  );
}

function MemberIdentity({ member, badges = [] }: { member: AssignmentMember; badges?: string[] }) {
  return <div className="member-identity"><span className="member-avatar">{initials(member.name)}</span><span className="member-identity-copy"><strong>{member.name}</strong><small title={member.email}>{member.email || "Email tidak tersedia"}</small>{badges.length ? <span className="member-badges">{badges.map((badge) => <em key={badge}>{badge}</em>)}</span> : null}</span></div>;
}

function WorkloadSummary({ member }: { member: AssignmentMember }) {
  return <span className={`compact-workload ${member.overdue_workload > 0 ? "has-overdue" : ""}`}><strong>{member.active_workload}</strong> aktif{member.overdue_workload > 0 ? <em>{member.overdue_workload} overdue</em> : null}</span>;
}

function MemberPickerDrawer({ title, description, rows, selectedIds, mode, kind, onApply, onClose }: MemberPickerDrawerProps) {
  const [draftIds, setDraftIds] = useState(selectedIds);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = `assignment-picker-${kind}-title`;
  const descriptionId = `assignment-picker-${kind}-description`;
  const filteredRows = useMemo(() => filterRoster(rows, query, mode === "single" ? "all" : filter, draftIds), [rows, query, filter, mode, draftIds]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const drawer = document.getElementById(`assignment-picker-${kind}`);
      if (!drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex='0']"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [kind, onClose]);

  function toggle(id: string) {
    setDraftIds((current) => mode === "single" ? (current.includes(id) ? [] : [id]) : toggleAssignmentId(current, id));
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const selectedCount = draftIds.length;

  return (
    <div className="modal-backdrop assignment-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside id={`assignment-picker-${kind}`} className="assignment-picker-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onMouseDown={(event) => event.stopPropagation()}>
        <header className="assignment-picker-header">
          <div><span className="drawer-kicker">Project assignment</span><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup panel">×</button>
        </header>
        <div className="assignment-picker-toolbar">
          <label className="assignment-search"><span className="sr-only">Cari anggota</span><span aria-hidden="true">⌕</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="Cari nama atau email…" /></label>
          <span className="assignment-picker-count">{selectedCount} terpilih</span>
        </div>
        {mode === "multi" ? <div className="assignment-picker-filters" role="group" aria-label="Filter anggota"><button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Semua</button><button type="button" className={filter === "selected" ? "active" : ""} onClick={() => setFilter("selected")}>Terpilih</button><button type="button" className={filter === "overdue" ? "active" : ""} onClick={() => setFilter("overdue")}>Ada overdue</button></div> : <button type="button" className={`assignment-unset-option ${selectedCount === 0 ? "selected" : ""}`} onClick={() => setDraftIds([])}><span className="assignment-radio" aria-hidden="true" />Belum ditentukan</button>}
        <div className="assignment-picker-list" aria-live="polite">
          {filteredRows.length ? filteredRows.map((row) => {
            const checked = draftIds.includes(row.id);
            const cannotAdd = !row.is_active && !checked;
            return <label key={row.id} className={`assignment-picker-row ${checked ? "selected" : ""} ${cannotAdd ? "inactive" : ""}`}><input type={mode === "multi" ? "checkbox" : "radio"} name={mode === "single" ? "pic-developer" : undefined} checked={checked} disabled={cannotAdd} onChange={() => toggle(row.id)} /><MemberIdentity member={row} badges={kind === "pic_developer" ? ["Developer"] : []} /><span className="assignment-picker-row-meta"><WorkloadSummary member={row} />{!row.is_active ? <em className="inactive-label">Tidak aktif</em> : null}</span></label>;
          }) : <div className="assignment-picker-empty"><strong>Tidak ada anggota ditemukan</strong><span>Coba kata kunci atau filter yang berbeda.</span></div>}
        </div>
        <footer className="assignment-picker-footer"><span>{selectedCount} {mode === "single" ? "PIC Developer" : kind === "pic_web" ? "PIC Web" : "developer"} terpilih</span><div className="row-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="button" className="btn btn-primary" onClick={() => onApply(draftIds)}>{mode === "single" ? "Terapkan pilihan" : "Terapkan pilihan"}</button></div></footer>
      </aside>
    </div>
  );
}

function AssignmentRemovalDialog({ members, onCancel, onConfirm }: { members: UserSummary[]; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="presentation"><div className="modal assignment-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="assignment-removal-title"><span className="drawer-kicker">Periksa perubahan</span><h2 id="assignment-removal-title">Hapus developer dari team?</h2><p className="muted">Project ini masih memiliki User Story aktif. Menghapus anggota tidak menghapus histori, tetapi assignment baru mereka tidak akan lagi tersedia untuk User Story berikutnya.</p><ul className="assignment-removal-list">{members.map((member) => <li key={member.id}><span className="member-avatar">{initials(member.name)}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></li>)}</ul><div className="modal-actions"><button type="button" className="btn" onClick={onCancel}>Kembali</button><button type="button" className="btn btn-primary" onClick={onConfirm}>Lanjutkan dan simpan</button></div></div></div>;
}

function createInitialAssignments(project: Project): ProjectAssignments {
  return { pic_web_ids: project.pic_web.map((member) => member.id), pic_developer_id: project.pic_developer_id, developer_ids: project.developers.map((member) => member.id) };
}

function mergeAssignedRows(rows: ProjectRosterCandidate[], assigned: UserSummary[], role: UserRole, selectedIds: string[]): AssignmentMember[] {
  const map = new Map(rows.map((row) => [row.id, { ...row }]));
  assigned.forEach((member) => {
    if (!map.has(member.id)) {
      map.set(member.id, { id: member.id, name: member.name, email: member.email || "", role: member.role || role, is_active: false, active_workload: 0, overdue_workload: 0 });
    }
  });
  return [...map.values()];
}
