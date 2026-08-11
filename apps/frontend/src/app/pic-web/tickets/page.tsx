"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { FileDropzone } from "@/components/FileDropzone";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ticketsApi, websitesApi } from "@/lib/api-services";
import { formatDateTime, ticketStatusLabel } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { Ticket, Website } from "@/lib/types";

const categoryOptions = [
  { value: "website", label: "Website" },
  { value: "help_desk", label: "Help desk" },
  { value: "procurement", label: "Procurement" },
];

function categoryLabel(value: string | null) {
  return categoryOptions.find((item) => item.value === value)?.label ?? "-";
}

export default function PicWebTicketsPage() {
  const { user } = useAuth();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [expectation, setExpectation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [websiteRes, ticketRes] = await Promise.all([
        websitesApi.list({ is_active: true, limit: 100 }),
        ticketsApi.list({ limit: 100 }),
      ]);
      setWebsites(websiteRes.data);
      setTickets(ticketRes.data);
      if (!websiteId && websiteRes.data.length === 1) setWebsiteId(websiteRes.data[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat tiket");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "pic_web") void load();
  }, [user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!websiteId || !category || !description.trim() || !expectation.trim()) {
      setError("Website, kategori, masalah, dan ekspektasi wajib diisi");
      return;
    }
    setSaving(true);
    try {
      let attachmentUrl: string | undefined;
      if (file) attachmentUrl = (await ticketsApi.uploadAttachment(file)).attachment_url;
      await ticketsApi.create({
        website_id: websiteId,
        category: category as "website" | "help_desk" | "procurement",
        description: description.trim(),
        expectation: expectation.trim(),
        attachment_url: attachmentUrl,
      });
      setDescription("");
      setExpectation("");
      setCategory("");
      setFile(null);
      setSuccess("Tiket berhasil dikirim ke developer penanggung jawab.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim tiket");
    } finally {
      setSaving(false);
    }
  }

  if (!user || user.role !== "pic_web") {
    return <AppShell title="Tiket Saya"><LoadingState /></AppShell>;
  }

  return (
    <AppShell title="Tiket Saya">
      <div className="page-toolbar">
        <p className="page-toolbar-desc muted">Buat dan pantau tiket untuk website yang menjadi tanggung jawab Anda.</p>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {success ? <div className="success-banner">{success}</div> : null}

      <div className="panel">
        <h2 className="panel-title">Buat tiket</h2>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          Tiket langsung masuk ke developer penanggung jawab website itu. Deadline bisa diisi Bos IT belakangan.
        </p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="pic-ticket-website">Website</label>
              <Select id="pic-ticket-website" className="block" value={websiteId} onChange={setWebsiteId} placeholder="Pilih website" options={websites.map((website) => ({ value: website.id, label: website.name }))} />
            </div>
            <div className="form-field">
              <label htmlFor="pic-ticket-category">Kategori</label>
              <Select id="pic-ticket-category" className="block" value={category} onChange={setCategory} placeholder="Pilih kategori" options={categoryOptions} />
            </div>
            <div className="form-field full">
              <label htmlFor="pic-ticket-description">Masalah yang ditemukan</label>
              <textarea id="pic-ticket-description" className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contoh: fotonya salah" />
            </div>
            <div className="form-field full">
              <label htmlFor="pic-ticket-expectation">Ekspektasi</label>
              <textarea id="pic-ticket-expectation" className="textarea" rows={3} value={expectation} onChange={(e) => setExpectation(e.target.value)} placeholder="Contoh: harusnya foto Y" />
            </div>
            <div className="form-field full">
              <label htmlFor="pic-ticket-attachment">Lampiran</label>
              <FileDropzone
                id="pic-ticket-attachment"
                file={file}
                disabled={saving}
                onChange={setFile}
              />
            </div>
          </div>
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={saving || loading}>{saving ? "Mengirim..." : "Kirim tiket"}</button>
          </div>
        </form>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2 className="panel-title">Tiket saya</h2>
        {loading ? <LoadingState /> : null}
        {!loading && tickets.length === 0 ? <EmptyState title="Belum ada tiket" description="Tiket yang Anda buat akan muncul di sini." /> : null}
        {!loading && tickets.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Website</th>
                  <th>Kategori</th>
                  <th>Masalah</th>
                  <th>Ekspektasi</th>
                  <th>Status</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const website = websites.find((item) => item.id === ticket.website_id);
                  return (
                    <tr key={ticket.id}>
                      <td>{website ? <Link href={`/websites/${website.id}`} className="list-title">{website.name}</Link> : <span className="muted">-</span>}</td>
                      <td>{categoryLabel(ticket.category)}</td>
                      <td style={{ maxWidth: 240 }}>{ticket.description ?? ticket.title}</td>
                      <td style={{ maxWidth: 240 }}>{ticket.expectation || <span className="muted">-</span>}</td>
                      <td><span className={`badge-soft task-status-${ticket.status}`}>{ticketStatusLabel(ticket.status)}</span></td>
                      <td>{ticket.sla_deadline ? formatDateTime(ticket.sla_deadline) : <span className="muted">Belum ada deadline</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
