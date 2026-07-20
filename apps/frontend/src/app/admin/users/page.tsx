"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { usersApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, isItOps, roleLabel } from "@/lib/format";
import type { User, UserRole } from "@/lib/types";

const roles: UserRole[] = [
  "end_user",
  "business_owner",
  "helpdesk",
  "developer",
  "it_ops",
];

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "helpdesk" as UserRole,
  is_active: true,
};

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
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
      const res = await usersApi.list({ limit: 100 });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat users");
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

  function openEdit(u: User) {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      is_active: u.is_active,
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
        await usersApi.update(editing.id, {
          name: form.name,
          role: form.role,
          is_active: form.is_active,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await usersApi.create({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  if (!user || !isItOps(user.role)) {
    return (
      <AppShell title="Users">
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Users"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Tambah User
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
        Kelola akun internal. Hanya role IT Ops yang dapat mengakses halaman ini.
      </p>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState title="Belum ada user" />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                  </td>
                  <td>{u.email}</td>
                  <td>{roleLabel(u.role)}</td>
                  <td>
                    <span className="badge-soft">{u.is_active ? "Aktif" : "Nonaktif"}</span>
                  </td>
                  <td>{formatDateTime(u.created_at)}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => openEdit(u)}>
                      Edit
                    </button>
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
            <h2>{editing ? "Edit User" : "Tambah User"}</h2>
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
                <div className="form-field full">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    type="email"
                    required
                    disabled={Boolean(editing)}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="role">Role</label>
                  <Select
                    id="role"
                    className="block"
                    value={form.role}
                    onChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
                    options={roles.map((r) => ({ value: r, label: roleLabel(r) }))}
                  />
                </div>
                {editing ? (
                  <div className="form-field">
                    <label htmlFor="active">Status</label>
                    <Select
                      id="active"
                      className="block"
                      value={form.is_active ? "true" : "false"}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, is_active: v === "true" }))
                      }
                      options={[
                        { value: "true", label: "Aktif" },
                        { value: "false", label: "Nonaktif" },
                      ]}
                    />
                  </div>
                ) : null}
                <div className="form-field full">
                  <label htmlFor="password">
                    Password {editing ? "(opsional)" : ""}
                  </label>
                  <input
                    id="password"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    type="password"
                    required={!editing}
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
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
