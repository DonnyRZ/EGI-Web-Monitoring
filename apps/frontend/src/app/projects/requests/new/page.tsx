"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { IconPaperclip } from "@/components/icons";
import { ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { projectRequestsApi, ticketsApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canCreateProjectRequest } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

interface ProjectRequestFormState {
  requested_name: string;
  briefing: string;
  expected_outcome: string;
  proposed_website_name: string;
  proposed_domain: string;
}

const INITIAL_FORM: ProjectRequestFormState = {
  requested_name: "",
  briefing: "",
  expected_outcome: "",
  proposed_website_name: "",
  proposed_domain: "",
};

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export default function NewProjectRequestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<ProjectRequestFormState>(INITIAL_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = Boolean(file || Object.values(form).some((value) => value.trim()));
  useUnsavedChanges("project-requests:create", dirty);

  useEffect(() => {
    if (!authLoading && user && !canCreateProjectRequest(user.role)) router.replace("/projects");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function updateField(field: keyof ProjectRequestFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFile(nextFile: File | null, input?: HTMLInputElement) {
    if (nextFile && nextFile.size > MAX_ATTACHMENT_SIZE) {
      if (input) input.value = "";
      setFile(null);
      setError("Ukuran lampiran maksimal 10 MB.");
      return;
    }
    setFile(nextFile);
    setError("");
  }

  function cancel() {
    if (dirty && !window.confirm("Perubahan belum disimpan. Keluar dari form?")) return;
    router.push("/projects/requests");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      let attachmentUrl: string | undefined;
      if (file) {
        const uploaded = await ticketsApi.uploadAttachment(file);
        attachmentUrl = uploaded.attachment_url;
      }
      const request = await projectRequestsApi.create({
        requested_name: form.requested_name.trim(),
        briefing: form.briefing.trim(),
        expected_outcome: form.expected_outcome.trim(),
        proposed_website_name: form.proposed_website_name.trim() || undefined,
        proposed_domain: form.proposed_domain.trim() || undefined,
        attachment_url: attachmentUrl,
      });
      router.replace(`/projects/requests/${request.id}?submitted=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim Pengajuan Project");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <AppShell title="Pengajuan Saya"><LoadingState label="Memuat form Pengajuan Project…" /></AppShell>;
  if (!user || !canCreateProjectRequest(user.role)) return <AppShell title="Pengajuan Saya"><LoadingState /></AppShell>;

  return (
    <AppShell title="Pengajuan Saya">
      <div className="project-request-create-page">
        <div className="project-request-form-page-header">
          <div>
            <Link href="/projects/requests" className="back-link">← Pengajuan Saya</Link>
            <span className="eyebrow">Pengajuan Project</span>
            <h2>Ajukan Project</h2>
          </div>
        </div>

        <section className="panel project-request-form-panel">
          <div className="project-request-form-intro">
            <h3>Informasi Project</h3>
            <span className="project-request-required-note"><span className="required-mark">*</span> Wajib diisi</span>
          </div>
        {error ? <ErrorBanner message={error} /> : null}
        <form className="project-request-form" onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="request-name">Nama Project <span className="required-mark">*</span></label>
            <input id="request-name" className="text-input" required maxLength={150} value={form.requested_name} onChange={(event) => updateField("requested_name", event.target.value)} placeholder="Contoh: Portal HR EGI" autoComplete="off" />
          </div>
          <div className="form-field">
            <label htmlFor="request-briefing">Ringkasan kebutuhan <span className="required-mark">*</span></label>
            <textarea id="request-briefing" className="text-input" required maxLength={10000} rows={4} value={form.briefing} onChange={(event) => updateField("briefing", event.target.value)} placeholder="Jelaskan latar belakang, pengguna, dan kebutuhan utama Project." />
          </div>
          <div className="form-field">
            <label htmlFor="request-outcome">Hasil yang diharapkan <span className="required-mark">*</span></label>
            <textarea id="request-outcome" className="text-input" required maxLength={10000} rows={4} value={form.expected_outcome} onChange={(event) => updateField("expected_outcome", event.target.value)} placeholder="Contoh: Tim dapat mengelola data karyawan melalui satu portal." />
          </div>
          <section className="project-request-optional-section" aria-labelledby="project-request-website-heading">
            <div className="project-request-optional-header">
              <h3 id="project-request-website-heading">Rencana Website <span className="project-request-optional-label">Opsional</span></h3>
            </div>
            <div className="project-request-form-grid">
              <div className="form-field">
                <label htmlFor="request-website-name">Nama Website</label>
                <input id="request-website-name" className="text-input" maxLength={150} value={form.proposed_website_name} onChange={(event) => updateField("proposed_website_name", event.target.value)} placeholder="Contoh: Portal HR" />
              </div>
              <div className="form-field">
                <label htmlFor="request-domain">Domain</label>
                <input id="request-domain" className="text-input" maxLength={255} value={form.proposed_domain} onChange={(event) => updateField("proposed_domain", event.target.value)} placeholder="Contoh: hr.egiresources.com" />
              </div>
            </div>
          </section>
          <div className="form-field">
            <span id="request-attachment-label" className="project-request-field-label">Lampiran pendukung <span className="project-request-optional-label">Opsional</span></span>
            <label htmlFor="request-attachment" className="project-request-file-control">
              <span className="project-request-file-icon" aria-hidden><IconPaperclip /></span>
              <span className="project-request-file-copy">
                <strong>{file ? file.name : "Pilih lampiran"}</strong>
                <small>{file ? "Lampiran siap dikirim" : "PDF, DOC, DOCX, TXT, atau gambar"}</small>
              </span>
              <span className="project-request-file-action">{file ? "Ganti" : "Pilih file"}</span>
              <input id="request-attachment" aria-labelledby="request-attachment-label" className="project-request-file-input sr-only" type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={(event) => updateFile(event.target.files?.[0] ?? null, event.currentTarget)} />
            </label>
            <span className="form-help">Maksimal 10 MB.</span>
          </div>
          <div className="project-request-form-actions">
            <button type="button" className="btn btn-neutral" onClick={cancel}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.requested_name.trim() || !form.briefing.trim() || !form.expected_outcome.trim()}>{saving ? "Mengirim…" : "Kirim Pengajuan"}</button>
          </div>
        </form>
        </section>
      </div>
    </AppShell>
  );
}
