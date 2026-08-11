"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { usersApi, websitesApi } from "@/lib/api-services";
import { canManagePlatform, roleLabel } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { User, Website } from "@/lib/types";

export default function AdminAssignmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [picWeb, setPicWeb] = useState<User[]>([]);
  const [developers, setDevelopers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && !canManagePlatform(user.role)) router.replace("/dashboard");
  }, [authLoading, user, router]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [websiteRes, picWebRes, developerRes] = await Promise.all([
        websitesApi.list({ limit: 100 }),
        usersApi.list({ role: "pic_web", is_active: true, limit: 100 }),
        usersApi.list({ role: "developer", is_active: true, limit: 100 }),
      ]);
      setWebsites(websiteRes.data);
      setPicWeb(picWebRes.data);
      setDevelopers(developerRes.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat assignment");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user && canManagePlatform(user.role)) void load();
  }, [user]);

  const picWebOptions = useMemo(
    () => [
      { value: "", label: "Belum ditentukan" },
      ...picWeb.map((u) => ({ value: u.id, label: u.name + " - " + roleLabel(u.role) })),
    ],
    [picWeb],
  );
  const developerOptions = useMemo(
    () => [
      { value: "", label: "Belum ditentukan" },
      ...developers.map((u) => ({ value: u.id, label: u.name })),
    ],
    [developers],
  );

  async function updateAssignment(
    website: Website,
    field: "owner_id" | "it_pic_id" | "backup_it_pic_id",
    value: string,
  ) {
    setSavingId(website.id);
    setError("");
    try {
      const next = {
        owner_id: website.owner_id,
        it_pic_id: website.it_pic_id,
        backup_it_pic_id: website.backup_it_pic_id,
        [field]: value || null,
      };
      await websitesApi.update(website.id, next);
      setWebsites((items) =>
        items.map((item) => (item.id === website.id ? { ...item, ...next } : item)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan assignment");
    } finally {
      setSavingId(null);
    }
  }

  if (!user || !canManagePlatform(user.role)) {
    return <AppShell title="PIC & Assignment"><LoadingState /></AppShell>;
  }

  return (
    <AppShell title="PIC & Assignment">
      <div className="page-toolbar">
        <div>
          <p className="page-toolbar-desc muted">
            Atur PIC Web, developer utama, dan backup developer per website.
          </p>
          <p className="muted">Backup PIC selalu dipilih dari user dengan role Developer.</p>
        </div>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}
      {!loading ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Website</th>
                <th>PIC Web</th>
                <th>Developer utama</th>
                <th>Backup developer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {websites.map((website) => (
                <tr key={website.id}>
                  <td>
                    <strong>{website.name}</strong>
                    <div className="muted">{website.domain}</div>
                  </td>
                  <td>
                    <Select
                      aria-label={"PIC Web " + website.name}
                      value={website.owner_id ?? ""}
                      options={picWebOptions}
                      disabled={savingId === website.id}
                      onChange={(value) => void updateAssignment(website, "owner_id", value)}
                    />
                  </td>
                  <td>
                    <Select
                      aria-label={"Developer utama " + website.name}
                      value={website.it_pic_id ?? ""}
                      options={developerOptions}
                      disabled={savingId === website.id}
                      onChange={(value) => void updateAssignment(website, "it_pic_id", value)}
                    />
                  </td>
                  <td>
                    <Select
                      aria-label={"Backup developer " + website.name}
                      value={website.backup_it_pic_id ?? ""}
                      options={developerOptions}
                      disabled={savingId === website.id}
                      onChange={(value) => void updateAssignment(website, "backup_it_pic_id", value)}
                    />
                  </td>
                  <td>
                    <span className="badge-soft">{website.is_active ? "Aktif" : "Nonaktif"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AppShell>
  );
}
