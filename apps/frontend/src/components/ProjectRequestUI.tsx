import Link from "next/link";
import type { UserRole, ProjectRequest, ProjectRequestStatus } from "@/lib/types";
import { canCreateProjectRequest, canReviewProjectRequests, formatDateTime, initials } from "@/lib/format";

export function ProjectAreaTabs({ role, active }: { role: UserRole; active: "projects" | "requests" }) {
  const reviewer = canReviewProjectRequests(role);
  const submitter = canCreateProjectRequest(role);
  const projectLabel = reviewer ? "Project" : "Project Saya";
  const requestLabel = reviewer ? "Pengajuan Project" : "Pengajuan Saya";

  return (
    <nav className="project-area-tabs" aria-label="Area Project">
      <Link href="/projects" className={active === "projects" ? "active" : ""} aria-current={active === "projects" ? "page" : undefined}>
        {projectLabel}
      </Link>
      {reviewer || submitter ? (
        <Link href="/projects/requests" className={active === "requests" ? "active" : ""} aria-current={active === "requests" ? "page" : undefined}>
          {requestLabel}
        </Link>
      ) : null}
    </nav>
  );
}

const STATUS_LABELS: Record<ProjectRequestStatus, string> = {
  pending: "Menunggu review",
  needs_info: "Perlu dilengkapi",
  approved: "Disetujui — Draft dibuat",
  rejected: "Ditolak",
};

export function projectRequestStatusLabel(status: ProjectRequestStatus) {
  return STATUS_LABELS[status];
}

export function ProjectRequestStatusPill({ status }: { status: ProjectRequestStatus }) {
  return <span className={`project-request-status ${status}`}>{STATUS_LABELS[status]}</span>;
}

function RequestAvatar({ name }: { name: string }) {
  return <span className="member-avatar project-request-avatar" aria-hidden>{initials(name)}</span>;
}

export function ProjectRequestList({ items }: { items: ProjectRequest[] }) {
  return (
    <section className="project-request-list-panel panel" aria-label="Daftar Pengajuan Project">
      <div className="project-request-table-wrap">
        <table className="project-request-table">
          <thead>
            <tr>
              <th>Pengajuan</th>
              <th>Diajukan oleh</th>
              <th>Dikirim</th>
              <th>Status</th>
              <th><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((request) => (
              <tr key={request.id}>
                <td>
                  <div className="project-request-name-cell">
                    <Link href={`/projects/requests/${request.id}`} className="project-request-name">{request.requested_name}</Link>
                    <span className="project-request-number">{request.request_number}</span>
                  </div>
                </td>
                <td>
                  <div className="project-request-person"><RequestAvatar name={request.submitted_by.name} /><span><strong>{request.submitted_by.name}</strong><small>{request.submitted_by.email}</small></span></div>
                </td>
                <td><span className="muted">{formatDateTime(request.created_at)}</span></td>
                <td><ProjectRequestStatusPill status={request.status} /></td>
                <td><Link href={`/projects/requests/${request.id}`} className="btn btn-sm btn-neutral">Lihat detail</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="project-request-card-list">
        {items.map((request) => (
          <Link key={request.id} href={`/projects/requests/${request.id}`} className="project-request-card">
            <div className="project-request-card-head"><span className="project-request-number">{request.request_number}</span><ProjectRequestStatusPill status={request.status} /></div>
            <h3>{request.requested_name}</h3>
            <div className="project-request-person"><RequestAvatar name={request.submitted_by.name} /><span><strong>{request.submitted_by.name}</strong><small>{formatDateTime(request.created_at)}</small></span></div>
            {request.review_note ? <p className="project-request-note">{request.review_note}</p> : null}
            <span className="project-request-card-action">Lihat detail <span aria-hidden>→</span></span>
          </Link>
        ))}
      </div>
    </section>
  );
}
