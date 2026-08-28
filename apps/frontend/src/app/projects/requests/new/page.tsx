"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProjectAreaTabs } from "@/components/ProjectRequestUI";
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

  if (authLoading) return <AppShell title="Project"><LoadingState label="Memuat form Pengajuan Project…" /></AppShell>;
  if (!user || !canCreateProjectRequest(user.role)) return <AppShell title="Project"><LoadingState /></AppShell>;

  return (
    <AppShell title="Project Saya">
      <ProjectAreaTabs role={user.role} active="requests" />
      <div className="project-request-form-page-header">
        <div>
          <Link href="/projects/requests" className="back-link">← Pengajuan Saya</Link>
          <span className="eyebrow">Pengajuan Project</span>
          <h2>Ajukan Project</h2>
          <p className="muted">Sampaikan kebutuhan Project kepada tim IT. Project baru akan dibuat setelah ditinjau.</p>
        </div>
      </div>

      <section className="panel project-request-form-panel">
        <div className="project-request-form-intro">
          <h3>Informasi Project</h3>
          <p className="muted">Isi konteks yang cukup agar tim IT dapat memahami kebutuhan Anda.</p>
        </div>
        {error ? <ErrorBanner message={error} /> : null}
        <form className="project-request-form" onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="request-name">Nama Project <span className="required-mark">*</span></label>
            <input id="request-name" className="text-input" required maxLength={150} value={form.requested_name} onChange={(event) => updateField("requested_name", event.target.value)} placeholder="Contoh: Portal HR EGI" autoComplete="off" />
          </div>
          <div className="form-field">
            <label htmlFor="request-briefing">Ringkasan kebutuhan <span className="required-mark">*</span></label>
            <textarea id="request-briefing" className="text-input" required maxLength={10000} rows={6} value={form.briefing} onChange={(event) => updateField("briefing", event.target.value)} placeholder="Jelaskan latar belakang, pengguna, dan kebutuhan utama Project." />
            <span className="form-help">Tuliskan masalah atau kebutuhan yang ingin diselesaikan.</span>
          </div>
          <div className="form-field">
            <label htmlFor="request-outcome">Hasil yang diharapkan <span className="required-mark">*</span></label>
            <textarea id="request-outcome" className="text-input" required maxLength={10000} rows={5} value={form.expected_outcome} onChange={(event) => updateField("expected_outcome", event.target.value)} placeholder="Contoh: Tim dapat mengelola data karyawan melalui satu portal." />
          </div>
          <div className="project-request-optional-section">
            <div>
              <h3>Rencana Website <span className="muted">Opsional</span></h3>
              <p className="muted">Jika sudah ada gambaran awal, Anda dapat mengisinya sekarang.</p>
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
          </div>
          <div className="form-field">
            <label htmlFor="request-attachment">Lampiran pendukung <span className="muted">Opsional</span></label>
            <input id="request-attachment" className="text-input project-request-file" type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <span className="form-help">Lampirkan brief atau referensi jika diperlukan. Maksimal 10 MB.</span>
            {file ? <span className="project-request-file-name">{file.name}</span> : null}
          </div>
          <div className="project-request-form-actions">
            <button type="button" className="btn btn-neutral" onClick={cancel}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.requested_name.trim() || !form.briefing.trim() || !form.expected_outcome.trim()}>{saving ? "Mengirim…" : "Kirim Pengajuan"}</button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
