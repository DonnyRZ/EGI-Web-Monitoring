"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { projectsApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import {
  canManageProjects,
  canViewProjectRegistry,
  formatDateTime,
  initials,
} from "@/lib/format";
import type { ProjectListSummary, ProjectStatus } from "@/lib/types";

type ConfigFilter = "missing_pic_web" | "missing_pic_developer" | "missing_developer_team" | "has_active_tickets" | "has_overdue_work";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Aktif",
  archived: "Archived",
};

const FILTER_LABELS: Record<ConfigFilter, string> = {
  missing_pic_web: "Belum ada PIC Web",
  missing_pic_developer: "Belum ada PIC Developer",
  missing_developer_team: "Belum ada developer team",
  has_active_tickets: "Ada Task aktif",
  has_overdue_work: "Ada pekerjaan overdue",
};

function healthLabel(status: ProjectListSummary["health"]) {
  if (status === "down") return "Down";
  if (status === "warning") return "Perlu perhatian";
  if (status === "normal") return "Sehat";
  return "Belum ada data";
}

function healthClass(status: ProjectListSummary["health"]) {
  return `project-health ${status}`;
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ProjectListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [filters, setFilters] = useState<Partial<Record<ConfigFilter, boolean>>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, value]) => value).map(([key]) => key as ConfigFilter),
    [filters],
  );

  useEffect(() => {
    if (!authLoading && user && !canViewProjectRegistry(user.role)) router.replace("/dashboard");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !canViewProjectRegistry(user.role)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      projectsApi
        .list({
          limit: 100,
          search: search.trim() || undefined,
          status: status || undefined,
          ...Object.fromEntries(activeFilters.map((filter) => [filter, true])),
        })
        .then((response) => {
          if (!cancelled) setItems(response.data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Gagal memuat Project");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, search, status, activeFilters]);

  function toggleFilter(filter: ConfigFilter) {
    setFilters((current) => ({ ...current, [filter]: !current[filter] }));
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const project = await projectsApi.create({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        status: "draft",
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal membuat Project");
    } finally {
      setSaving(false);
    }
  }

  if (!user || !canViewProjectRegistry(user.role)) {
    return (
      <AppShell title="Project">
        <LoadingState />
      </AppShell>
    );
  }

  const title = canManageProjects(user.role) ? "Kelola Project" : "Project Saya";
  const technicalView = user.role === "bos_it" || user.role === "developer";

  return (
    <AppShell title={title}>
      <section className="project-page-intro">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>{title}</h2>
          <p className="muted">{technicalView ? "Satu ruang kerja untuk website, tanggung jawab, Task, dan pekerjaan teknis." : "Satu ruang kerja untuk website, PIC, Task, dan status pekerjaan."}</p>
        </div>
        {canManageProjects(user.role) ? (
          <button type="button" className="btn btn-primary" onClick={() => { setFormError(""); setCreateOpen(true); }}>
            Tambah Project
          </button>
        ) : null}
      </section>

      <section className="project-toolbar panel" aria-label="Filter Project">
        <div className="project-search-wrap">
          <label className="sr-only" htmlFor="project-search">Cari Project</label>
          <input
            id="project-search"
            className="text-input project-search"
            placeholder="Cari nama Project atau domain…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          value={status}
          onChange={(value) => setStatus(value as ProjectStatus | "")}
          options={[{ value: "", label: "Semua status" }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
          aria-label="Filter status Project"
          className="project-status-filter"
        />
        <button
          type="button"
          className={`filter-toggle ${activeFilters.length > 0 ? "active" : ""}`}
          aria-expanded={activeFilters.length > 0}
          onClick={() => {
            if (activeFilters.length > 0) setFilters({});
            else setFilters({ missing_pic_web: true });
          }}
        >
          {activeFilters.length > 0 ? `${activeFilters.length} filter aktif` : "Filter konfigurasi"}
        </button>
      </section>

      <section className="project-filter-chips" aria-label="Filter konfigurasi tambahan">
        {(Object.keys(FILTER_LABELS) as ConfigFilter[]).map((filter) => (
          <label key={filter} className={`filter-chip ${filters[filter] ? "selected" : ""}`}>
            <input type="checkbox" checked={Boolean(filters[filter])} onChange={() => toggleFilter(filter)} />
            <span>{FILTER_LABELS[filter]}</span>
          </label>
        ))}
      </section>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState label="Memuat Project…" /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title={search || status || activeFilters.length ? "Project tidak ditemukan" : "Belum ada Project"}
          description={search || status || activeFilters.length ? "Coba ubah kata kunci atau filter Anda." : "Project baru dapat dibuat sebagai Draft tanpa Website terlebih dahulu."}
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="project-table-wrap panel">
            <table className="project-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Website & health</th>
                  <th>PIC Web</th>
                  <th>PIC Developer</th>
                  <th>Work</th>
                  <th>Status konfigurasi</th>
                  <th><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div className="project-name-cell">
                        <Link href={`/projects/${project.id}`} className="project-name-link">{project.name}</Link>
                        <span className={`project-status-pill ${project.status}`}>{STATUS_LABELS[project.status]}</span>
                        <span className="muted project-updated">Diperbarui {formatDateTime(project.updated_at)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="project-health-cell">
                        <span className={healthClass(project.health)}><span className="project-health-dot" />{healthLabel(project.health)}</span>
                        <span className="muted">{project.websites_count ? `${project.websites_count} website` : "Draft — belum ada website"}</span>
                      </div>
                    </td>
                    <td><MemberStack members={project.pic_web} empty="Belum ada" /></td>
                    <td><MemberStack members={project.pic_developer ? [project.pic_developer] : []} empty="Opsional" /></td>
                    <td>
                      <div className="project-work-cell">
                        <strong>{technicalView ? project.active_stories_count : project.active_tickets_count}</strong><span>{technicalView ? " pekerjaan teknis aktif" : " Task aktif"}</span>
                        {technicalView && project.active_tickets_count > 0 ? <small>{project.active_tickets_count} Task intake</small> : null}
                        {project.overdue_count > 0 ? <small className="text-danger">{project.overdue_count} overdue</small> : null}
                      </div>
                    </td>
                    <td><span className={`configuration-pill ${project.configuration_status}`}>{project.configuration_status === "ready" ? "Siap digunakan" : "Perlu setup"}</span></td>
                    <td><Link href={`/projects/${project.id}`} className="btn btn-sm btn-neutral">Buka Project</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="project-card-grid">
            {items.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="project-card">
                <div className="project-card-top"><span className={`project-status-pill ${project.status}`}>{STATUS_LABELS[project.status]}</span><span className={healthClass(project.health)}><span className="project-health-dot" />{healthLabel(project.health)}</span></div>
                <h3>{project.name}</h3>
                <p>{project.websites_count ? `${project.websites_count} website` : "Draft — belum ada website"}</p>
                <div className="project-card-stats"><span>{technicalView ? `${project.active_stories_count} pekerjaan teknis aktif` : `${project.active_tickets_count} Task aktif`}</span>{technicalView && project.active_tickets_count > 0 ? <span>{project.active_tickets_count} Task intake</span> : null}{project.overdue_count ? <span className="text-danger">{project.overdue_count} overdue</span> : null}</div>
                <div className="project-card-footer"><MemberStack members={project.pic_web} empty="Belum ada PIC Web" /><span className={`configuration-pill ${project.configuration_status}`}>{project.configuration_status === "ready" ? "Siap" : "Perlu setup"}</span></div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {createOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div className="modal project-create-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-kicker">Project baru</div>
            <h2>Tambah Project</h2>
            <p className="muted">Mulai dari konteks kerja. Website dan assignment dapat diatur setelah Project dibuat.</p>
            {formError ? <ErrorBanner message={formError} /> : null}
            <form onSubmit={createProject}>
              <div className="form-field">
                <label htmlFor="new-project-name">Nama Project <span className="required-mark">*</span></label>
                <input id="new-project-name" className="text-input" required autoFocus maxLength={150} value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Contoh: Web IT" />
              </div>
              <div className="form-field">
                <label htmlFor="new-project-description">Deskripsi <span className="muted">(opsional)</span></label>
                <textarea id="new-project-description" className="text-input" rows={5} value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="Tujuan, batasan, atau konteks Project…" />
              </div>
              <div className="draft-note"><span className="project-status-pill draft">Draft</span><span>Project dibuat sebagai Draft dan boleh belum memiliki Website.</span></div>
              <div className="modal-actions"><button type="button" className="btn" onClick={() => setCreateOpen(false)}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving || !createName.trim()}>{saving ? "Membuat…" : "Buat Project"}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function MemberStack({ members, empty }: { members: Array<{ id: string; name: string }>; empty: string }) {
  if (members.length === 0) return <span className="muted">{empty}</span>;
  return (
    <div className="member-stack" title={members.map((member) => member.name).join(", ")}>
      <span className="member-avatars">{members.slice(0, 3).map((member) => <span key={member.id} className="member-avatar">{initials(member.name)}</span>)}</span>
      <span className="member-name">{members[0].name}{members.length > 1 ? ` +${members.length - 1}` : ""}</span>
    </div>
  );
}
