"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProjectAreaTabs, ProjectRequestStatusPill } from "@/components/ProjectRequestUI";
import { ErrorBanner, LoadingState, SuccessBanner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { projectRequestsApi, ticketsApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canCreateProjectRequest, canReviewProjectRequests, formatDateTime } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import type { ProjectRequest, ProjectRequestStatus } from "@/lib/types";

interface RequestFormState {
  requested_name: string;
  briefing: string;
  expected_outcome: string;
  proposed_website_name: string;
  proposed_domain: string;
}

function formFromRequest(request: ProjectRequest): RequestFormState {
  return {
    requested_name: request.requested_name,
    briefing: request.briefing,
    expected_outcome: request.expected_outcome,
    proposed_website_name: request.proposed_website_name ?? "",
    proposed_domain: request.proposed_domain ?? "",
  };
}

function statusDescription(status: ProjectRequestStatus) {
  switch (status) {
    case "pending":
      return "Pengajuan sedang menunggu ditinjau oleh tim IT.";
    case "needs_info":
      return "Tim IT meminta informasi tambahan sebelum dapat memproses pengajuan ini.";
    case "approved":
      return "Pengajuan telah disetujui dan Project Draft sudah dibuat.";
    case "rejected":
      return "Pengajuan ini tidak disetujui oleh tim IT.";
  }
}

function RequestFields({
  form,
  onChange,
  editable,
  file,
  onFileChange,
}: {
  form: RequestFormState;
  onChange: (field: keyof RequestFormState, value: string) => void;
  editable: boolean;
  file?: File | null;
  onFileChange?: (file: File | null) => void;
}) {
  return (
    <div className="project-request-form">
      <div className="form-field">
        <label htmlFor="request-name">Nama Project</label>
        {editable ? <input id="request-name" className="text-input" required maxLength={150} value={form.requested_name} onChange={(event) => onChange("requested_name", event.target.value)} /> : <p className="project-request-readonly-value">{form.requested_name}</p>}
      </div>
      <div className="form-field">
        <label htmlFor="request-briefing">Ringkasan kebutuhan</label>
        {editable ? <textarea id="request-briefing" className="text-input" required maxLength={10000} rows={6} value={form.briefing} onChange={(event) => onChange("briefing", event.target.value)} /> : <p className="project-request-long-value">{form.briefing}</p>}
      </div>
      <div className="form-field">
        <label htmlFor="request-outcome">Hasil yang diharapkan</label>
        {editable ? <textarea id="request-outcome" className="text-input" required maxLength={10000} rows={5} value={form.expected_outcome} onChange={(event) => onChange("expected_outcome", event.target.value)} /> : <p className="project-request-long-value">{form.expected_outcome}</p>}
      </div>
      <div className="project-request-form-grid">
        <div className="form-field">
          <label htmlFor="request-website-name">Nama Website</label>
          {editable ? <input id="request-website-name" className="text-input" maxLength={150} value={form.proposed_website_name} onChange={(event) => onChange("proposed_website_name", event.target.value)} placeholder="Belum ditentukan" /> : <p className="project-request-readonly-value">{form.proposed_website_name || "Belum ditentukan"}</p>}
        </div>
        <div className="form-field">
          <label htmlFor="request-domain">Domain</label>
          {editable ? <input id="request-domain" className="text-input" maxLength={255} value={form.proposed_domain} onChange={(event) => onChange("proposed_domain", event.target.value)} placeholder="Belum ditentukan" /> : <p className="project-request-readonly-value">{form.proposed_domain || "Belum ditentukan"}</p>}
        </div>
      </div>
      {editable && onFileChange ? (
        <div className="form-field">
          <label htmlFor="request-attachment">Lampiran pendukung</label>
          <input id="request-attachment" className="text-input project-request-file" type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
          {file ? <span className="project-request-file-name">Lampiran baru: {file.name}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [request, setRequest] = useState<ProjectRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [editForm, setEditForm] = useState<RequestFormState | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busyAction, setBusyAction] = useState<"save" | "request-info" | "reject" | "approve" | "attachment" | "">("");

  const canRead = Boolean(user && (canReviewProjectRequests(user.role) || canCreateProjectRequest(user.role)));
  const canReview = Boolean(user && canReviewProjectRequests(user.role));
  const canEdit = Boolean(user && request && canCreateProjectRequest(user.role) && request.submitted_by.id === user.id && request.status === "needs_info");
  const editDirty = Boolean(editForm && request && JSON.stringify(editForm) !== JSON.stringify(formFromRequest(request))) || Boolean(editFile);
  const reviewDirty = Boolean(request && canReview && (
    reviewName !== request.requested_name
    || reviewDescription !== request.briefing
    || reviewNote !== (request.review_note ?? "")
  ));
  useUnsavedChanges(`project-requests:${requestId}:edit`, canEdit && editDirty);
  useUnsavedChanges(`project-requests:${requestId}:review`, canReview && reviewDirty);

  useEffect(() => {
    if (!authLoading && user && !canRead) router.replace("/projects");
  }, [authLoading, canRead, router, user]);

  useEffect(() => {
    if (!user || !canRead || !requestId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    projectRequestsApi
      .get(requestId)
      .then((value) => {
        if (cancelled) return;
        setRequest(value);
        setEditForm(formFromRequest(value));
        setReviewName(value.requested_name);
        setReviewDescription(value.briefing);
        setReviewNote(value.review_note ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Gagal memuat Pengajuan Project");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, requestId, user]);

  useEffect(() => {
    const dirty = (canEdit && editDirty) || (canReview && reviewDirty);
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [canEdit, canReview, editDirty, reviewDirty]);

  function updateEditField(field: keyof RequestFormState, value: string) {
    setEditForm((current) => current ? { ...current, [field]: value } : current);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm || !request) return;
    setBusyAction("save");
    setActionError("");
    try {
      let attachmentUrl: string | undefined;
      if (editFile) attachmentUrl = (await ticketsApi.uploadAttachment(editFile)).attachment_url;
      const updated = await projectRequestsApi.update(request.id, {
        requested_name: editForm.requested_name.trim(),
        briefing: editForm.briefing.trim(),
        expected_outcome: editForm.expected_outcome.trim(),
        proposed_website_name: editForm.proposed_website_name.trim(),
        proposed_domain: editForm.proposed_domain.trim(),
        ...(attachmentUrl ? { attachment_url: attachmentUrl } : {}),
      });
      setRequest(updated);
      setEditForm(formFromRequest(updated));
      setEditFile(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal memperbarui Pengajuan Project");
    } finally {
      setBusyAction("");
    }
  }

  function reviewNoteOrError(label: string) {
    const note = reviewNote.trim();
    if (!note) {
      setActionError(`${label} wajib disertai catatan.`);
      return null;
    }
    return note;
  }

  async function requestInfo() {
    if (!request) return;
    const note = reviewNoteOrError("Permintaan kelengkapan");
    if (!note) return;
    setBusyAction("request-info");
    setActionError("");
    try {
      setRequest(await projectRequestsApi.requestInfo(request.id, note));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal meminta kelengkapan");
    } finally {
      setBusyAction("");
    }
  }

  async function reject() {
    if (!request) return;
    const note = reviewNoteOrError("Alasan penolakan");
    if (!note) return;
    setBusyAction("reject");
    setActionError("");
    try {
      setRequest(await projectRequestsApi.reject(request.id, note));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal menolak Pengajuan Project");
    } finally {
      setBusyAction("");
    }
  }

  async function approve() {
    if (!request) return;
    const name = reviewName.trim();
    if (!name) {
      setActionError("Nama Project final wajib diisi.");
      return;
    }
    setBusyAction("approve");
    setActionError("");
    try {
      const result = await projectRequestsApi.approve(request.id, {
        name,
        description: reviewDescription.trim() || undefined,
        review_note: reviewNote.trim() || undefined,
      });
      setRequest(result.request);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal menyetujui Pengajuan Project");
    } finally {
      setBusyAction("");
    }
  }

  async function openAttachment() {
    if (!request?.attachment_url) return;
    setBusyAction("attachment");
    setActionError("");
    try {
      const result = await projectRequestsApi.attachment(request.id);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gagal membuka lampiran");
    } finally {
      setBusyAction("");
    }
  }

  function goBack() {
    const dirty = (canEdit && editDirty) || (canReview && reviewDirty);
    if (dirty && !window.confirm("Perubahan belum disimpan. Keluar dari halaman ini?")) return;
    router.push("/projects/requests");
  }

  if (authLoading || !user || !canRead) return <AppShell title="Project"><LoadingState label="Memuat Pengajuan Project…" /></AppShell>;
  if (loading) return <AppShell title={canReview ? "Kelola Project" : "Project Saya"}><LoadingState label="Memuat detail Pengajuan Project…" /></AppShell>;
  if (!request) return <AppShell title="Project"><ErrorBanner message={error || "Pengajuan Project tidak ditemukan"} /><button type="button" className="btn btn-neutral" onClick={goBack}>Kembali</button></AppShell>;

  const editableForm = editForm ?? formFromRequest(request);
  const isSubmitted = searchParams.get("submitted") === "1";
  const reviewerCanAct = canReview && (request.status === "pending" || request.status === "needs_info");

  return (
    <AppShell title={canReview ? "Kelola Project" : "Project Saya"}>
      <ProjectAreaTabs role={user.role} active="requests" />
      {isSubmitted ? <SuccessBanner message="Pengajuan Project berhasil dikirim. Simpan nomor pengajuan ini untuk pelacakan." /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      <div className="project-request-detail-header">
        <button type="button" className="back-link back-link-button" onClick={goBack}>← Kembali ke pengajuan</button>
        <div className="project-request-detail-title-row">
          <div>
            <span className="eyebrow">Pengajuan Project</span>
            <h2>{request.requested_name}</h2>
            <p className="project-request-number-large">{request.request_number}</p>
          </div>
          <ProjectRequestStatusPill status={request.status} />
        </div>
        <p className="muted">{statusDescription(request.status)}</p>
      </div>

      <div className="project-request-detail-grid">
        <main className="project-request-detail-main">
          <section className="panel project-request-section">
            <div className="panel-heading-row"><div><span className="eyebrow">Informasi pengajuan</span><h3 className="panel-title">Kebutuhan Project</h3></div><span className="muted">Dikirim {formatDateTime(request.created_at)}</span></div>
            <div className="project-request-original">
              <RequestFields form={formFromRequest(request)} onChange={() => undefined} editable={false} />
            </div>
            {request.attachment_url ? <div className="project-request-attachment"><span>Lampiran pendukung tersedia</span><button type="button" className="btn btn-sm btn-neutral" disabled={busyAction === "attachment"} onClick={() => void openAttachment()}>{busyAction === "attachment" ? "Membuka…" : "Buka lampiran"}</button></div> : <p className="muted">Tidak ada lampiran pendukung.</p>}
          </section>

          {canEdit ? (
            <section className="panel project-request-section project-request-edit-section">
              <div className="panel-heading-row"><div><span className="eyebrow">Perbaiki pengajuan</span><h3 className="panel-title">Lengkapi informasi</h3></div><span className="project-request-status needs_info">Perlu dilengkapi</span></div>
              <p className="muted">Perbarui informasi sesuai catatan dari tim IT. Setelah disimpan, pengajuan akan kembali menunggu review.</p>
              <form onSubmit={saveEdit}>
                <RequestFields form={editableForm} onChange={updateEditField} editable file={editFile} onFileChange={setEditFile} />
                <div className="project-request-form-actions"><button type="button" className="btn btn-neutral" onClick={goBack}>Batal</button><button type="submit" className="btn btn-primary" disabled={busyAction === "save"}>{busyAction === "save" ? "Menyimpan…" : "Kirim kembali untuk ditinjau"}</button></div>
              </form>
            </section>
          ) : null}
        </main>

        <aside className="project-request-detail-side">
          <section className="panel project-request-meta-panel">
            <h3 className="panel-title">Ringkasan</h3>
            <dl className="project-request-meta-list">
              <div><dt>Diajukan oleh</dt><dd>{request.submitted_by.name}<small>{request.submitted_by.email}</small></dd></div>
              <div><dt>Terakhir diperbarui</dt><dd>{formatDateTime(request.updated_at)}</dd></div>
              {request.reviewed_by ? <div><dt>Ditinjau oleh</dt><dd>{request.reviewed_by.name}<small>{request.reviewed_at ? formatDateTime(request.reviewed_at) : ""}</small></dd></div> : null}
              {request.project ? <div><dt>Project Draft</dt><dd><Link href={`/projects/${request.project.id}`}>{request.project.name}</Link></dd></div> : null}
            </dl>
          </section>
          {request.review_note ? <section className="panel project-request-note-panel"><span className="eyebrow">Catatan tim IT</span><p>{request.review_note}</p></section> : null}
          {request.status === "approved" && request.project ? <section className="panel project-request-next-panel"><h3 className="panel-title">Langkah berikutnya</h3><p className="muted">Project Draft sudah tersedia. Tim IT dapat melanjutkan konfigurasi Website dan penanggung jawab.</p><Link href={`/projects/${request.project.id}`} className="btn btn-primary">Buka Project Draft</Link></section> : null}
        </aside>
      </div>

      {reviewerCanAct ? (
        <section className="panel project-request-review-panel">
          <div className="panel-heading-row"><div><span className="eyebrow">Tindakan tim IT</span><h3 className="panel-title">Review Pengajuan</h3></div><span className="muted">{request.status === "needs_info" ? "Menunggu perbaikan PIC Web" : "Pilih tindakan"}</span></div>
          <div className="project-request-review-form">
            <div className="form-field"><label htmlFor="review-name">Nama Project final</label><input id="review-name" className="text-input" maxLength={150} value={reviewName} onChange={(event) => setReviewName(event.target.value)} disabled={request.status !== "pending" || busyAction !== ""} /></div>
            <div className="form-field"><label htmlFor="review-description">Deskripsi Project Draft</label><textarea id="review-description" className="text-input" maxLength={10000} rows={5} value={reviewDescription} onChange={(event) => setReviewDescription(event.target.value)} disabled={request.status !== "pending" || busyAction !== ""} /></div>
            <div className="form-field"><label htmlFor="review-note">Catatan untuk PIC Web <span className="muted">Wajib untuk meminta kelengkapan atau menolak</span></label><textarea id="review-note" className="text-input" maxLength={5000} rows={4} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Tulis catatan yang jelas dan dapat ditindaklanjuti." disabled={busyAction !== ""} /></div>
          </div>
          <div className="project-request-review-actions">
            <button type="button" className="btn btn-neutral" disabled={busyAction !== ""} onClick={() => void requestInfo()}>Minta dilengkapi</button>
            <button type="button" className="btn btn-danger-outline" disabled={busyAction !== ""} onClick={() => void reject()}>Tolak</button>
            <button type="button" className="btn btn-primary" disabled={request.status !== "pending" || busyAction !== ""} onClick={() => void approve()}>{busyAction === "approve" ? "Menyetujui…" : "Setujui & buat Draft"}</button>
          </div>
        </section>
      ) : null}

    </AppShell>
  );
}
