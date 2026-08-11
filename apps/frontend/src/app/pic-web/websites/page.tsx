"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { websitesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import type { Website } from "@/lib/types";

export default function PicWebWebsitesPage() {
  const { user } = useAuth();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || user.role !== "pic_web") return;
    (async () => {
      try {
        const res = await websitesApi.list({ is_active: true, limit: 100 });
        setWebsites(res.data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Gagal memuat website");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (!user || user.role !== "pic_web") {
    return <AppShell title="Website Saya"><LoadingState /></AppShell>;
  }

  return (
    <AppShell title="Website Saya">
      <div className="page-toolbar">
        <p className="page-toolbar-desc muted">Website yang menjadi tanggung jawab Anda sebagai PIC Web.</p>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState /> : null}
      {!loading && !error && websites.length === 0 ? (
        <EmptyState title="Belum ada website" description="Belum ada website aktif yang ditugaskan kepada Anda." />
      ) : null}
      {!loading && websites.length > 0 ? (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Website</th><th>Domain</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {websites.map((website) => (
                <tr key={website.id}>
                  <td><strong>{website.name}</strong></td>
                  <td className="muted">{website.domain}</td>
                  <td><span className="badge-soft">Aktif</span></td>
                  <td><Link href={`/websites/${website.id}`} className="btn btn-sm btn-neutral">Lihat detail</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AppShell>
  );
}
