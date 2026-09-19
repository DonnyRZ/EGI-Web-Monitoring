"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useBodyScrollLock, useDialogFocus } from "@/components/ResponsiveOverlay";
import { Select } from "@/components/Select";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { usersApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { USER_ROLES } from "@egi/shared-types";
import { canManagePlatform, formatDateTime, roleLabel } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import type { User, UserRole } from "@/lib/types";

const roles: UserRole[] = [...USER_ROLES];

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "end_user" as UserRole,
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
  const modalRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const formDirty = modalOpen && (editing
    ? form.name !== editing.name || form.role !== editing.role || form.is_active !== editing.is_active || Boolean(form.password)
    : form.name !== emptyForm.name || form.email !== emptyForm.email || Boolean(form.password) || form.role !== emptyForm.role);
  function requestClose() {
    if (formDirty && !window.confirm("Perubahan belum disimpan. Tutup form?")) return;
    setModalOpen(false);
  }
  useUnsavedChanges("admin-users:form", formDirty);
  useBodyScrollLock(modalOpen);
  useDialogFocus(modalOpen, modalRef, undefined, requestClose);

  useEffect(() => {
    if (!authLoading && user && !canManagePlatform(user.role)) {
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
    if (user && canManagePlatform(user.role)) void load();
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
    if (saving) return;
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) {
      setFormError("Nama wajib diisi.");
      nameInputRef.current?.focus();
      return;
    }
    if (!editing && (!email || !/^\S+@\S+\.\S+$/.test(email))) {
      setFormError("Masukkan alamat email yang valid.");
      emailInputRef.current?.focus();
      return;
    }
    if (!editing && form.password.length < 8) {
      setFormError("Password minimal 8 karakter.");
      passwordInputRef.current?.focus();
      return;
    }
    if (editing && form.password && form.password.length < 8) {
      setFormError("Password baru minimal 8 karakter.");
      passwordInputRef.current?.focus();
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        await usersApi.update(editing.id, {
          name,
          role: form.role,
          is_active: form.is_active,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await usersApi.create({
          name,
          email,
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

  if (!user || !canManagePlatform(user.role)) {
    return (
      <AppShell title="Users">
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell title="Users">
      <section className="page-intro page-intro-compact">
        <div className="page-intro-actions">
          <span className="dashboard-count-card"><strong>{loading ? "—" : items.length}</strong><span>akun terdaftar</span></span>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Tambah User
          </button>
        </div>
      </section>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState title="Belum ada user" />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="panel table-wrap admin-users-table" style={{ padding: 0 }}>
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
                    <button type="button" className="btn btn-sm btn-neutral" onClick={() => openEdit(u)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="user-card-list" aria-label="Daftar user">
          {items.map((u) => (
            <article className="user-card" key={u.id}>
              <div className="user-card-identity">
                <strong>{u.name}</strong>
                <span>{u.email}</span>
              </div>
              <div className="user-card-meta">
                <span>{roleLabel(u.role)}</span>
                <span className={`badge-soft ${u.is_active ? "" : "user-card-inactive"}`}>{u.is_active ? "Aktif" : "Nonaktif"}</span>
              </div>
              <button type="button" className="btn btn-neutral user-card-action" onClick={() => openEdit(u)}>Edit</button>
            </article>
          ))}
        </div>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={requestClose}>
          <div
            ref={modalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-form-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="user-form-title">{editing ? "Edit User" : "Tambah User"}</h2>
            {formError ? <ErrorBanner message={formError} /> : null}
            <form noValidate onSubmit={onSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label htmlFor="name">Nama <span className="required-mark">*</span></label>
                  <input
                    ref={nameInputRef}
                    id="name"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    aria-required="true"
                    value={form.name}
                    maxLength={150}
                    onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setFormError(""); }}
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="email">Email {!editing ? <span className="required-mark">*</span> : null}</label>
                  <input
                    ref={emailInputRef}
                    id="email"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    type="email"
                    aria-required={!editing ? "true" : undefined}
                    disabled={Boolean(editing)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={form.email}
                    onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setFormError(""); }}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="role">Role</label>
                  <Select
                    id="role"
                    className="block"
                    value={form.role}
                    onChange={(v) => { setForm((f) => ({ ...f, role: v as UserRole })); setFormError(""); }}
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
                        { setForm((f) => ({ ...f, is_active: v === "true" })); setFormError(""); }
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
                    Password {editing ? "(opsional)" : <span className="required-mark">*</span>}
                  </label>
                  <input
                    ref={passwordInputRef}
                    id="password"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    type="password"
                    aria-required={!editing ? "true" : undefined}
                    minLength={8}
                    value={form.password}
                    autoComplete={editing ? "new-password" : "new-password"}
                    onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setFormError(""); }}
                  />
                </div>
              </div>
              <div className="modal-actions">
                  <button type="button" className="btn" onClick={requestClose}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
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
