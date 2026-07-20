"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { websitesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, isItOps } from "@/lib/format";
import type { Website } from "@/lib/types";
import { useRouter } from "next/navigation";

const emptyForm = {
  name: "",
  domain: "",
  url: "",
  is_active: true,
};

export default function AdminWebsitesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Website | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!authLoading && user && !isItOps(user.role)) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await websitesApi.list({ limit: 100 });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat websites");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user && isItOps(user.role)) void load();
  }, [user]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(w: Website) {
    setEditing(w);
    setForm({
      name: w.name,
      domain: w.domain,
      url: w.url,
      is_active: w.is_active,
    });
    setFormError("");
    setModalOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        await websitesApi.update(editing.id, form);
      } else {
        await websitesApi.create(form);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(w: Website) {
    if (!confirm(`Nonaktifkan ${w.name}?`)) return;
    try {
      await websitesApi.remove(w.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menonaktifkan website");
    }
  }

  if (!user || !isItOps(user.role)) {
    return (
      <AppShell title="Kelola Website">
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Kelola Website"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Tambah Website
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
        Registry website yang dipantau. Ini bukan halaman detail monitoring.
      </p>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState title="Belum ada website" description="Tambahkan website ke registry monitoring." />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Domain</th>
                <th>URL</th>
                <th>Status</th>
                <th>Diperbarui</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong>{w.name}</strong>
                  </td>
                  <td>{w.domain}</td>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {w.url}
                  </td>
                  <td>
                    <span className={`badge-soft ${w.is_active ? "" : ""}`}>
                      {w.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td>{formatDateTime(w.updated_at)}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn" onClick={() => openEdit(w)}>
                        Edit
                      </button>
                      {w.is_active ? (
                        <button type="button" className="btn" onClick={() => void deactivate(w)}>
                          Nonaktifkan
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editing ? "Edit Website" : "Tambah Website"}</h2>
            {formError ? <ErrorBanner message={formError} /> : null}
            <form onSubmit={onSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label htmlFor="name">Nama</label>
                  <input
                    id="name"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="domain">Domain</label>
                  <input
                    id="domain"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    required
                    value={form.domain}
                    onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="active">Aktif</label>
                  <Select
                    id="active"
                    className="block"
                    value={form.is_active ? "true" : "false"}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, is_active: v === "true" }))
                    }
                    options={[
                      { value: "true", label: "Ya" },
                      { value: "false", label: "Tidak" },
                    ]}
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="url">URL</label>
                  <input
                    id="url"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    type="url"
                    required
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setModalOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
