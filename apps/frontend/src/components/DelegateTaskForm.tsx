"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Select } from "@/components/Select";
import { ErrorBanner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { tasksApi, workloadApi } from "@/lib/api-services";
import type { DeveloperWorkload } from "@/lib/types";

function defaultSlaLocalValue() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface DelegateTaskFormProps {
  websiteId: string;
  websiteName: string;
}

export function DelegateTaskForm({ websiteId, websiteName }: DelegateTaskFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [developers, setDevelopers] = useState<DeveloperWorkload[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [instructionNotes, setInstructionNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [slaDeadline, setSlaDeadline] = useState(defaultSlaLocalValue);
  const [attachmentName, setAttachmentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingUsers(true);
      try {
        // /users is intentionally superadmin-only. Workload is already
        // available to Bos IT and returns the active developer roster needed
        // for delegation without exposing user-management data.
        const res = await workloadApi.developers();
        if (cancelled) return;
        setDevelopers(res);
        if (res.length === 1) setAssigneeId(res[0].developer_id);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Gagal memuat daftar developer",
          );
        }
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assigneeOptions = useMemo(
    () =>
      developers.map((u) => ({
        value: u.developer_id,
        label: u.developer_name,
      })),
    [developers],
  );

  function resetForm() {
    setInstructionNotes("");
    setAssigneeId(developers.length === 1 ? developers[0].developer_id : "");
    setSlaDeadline(defaultSlaLocalValue());
    setAttachmentName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!instructionNotes.trim()) {
      setError("Catatan instruksi wajib diisi");
      return;
    }
    if (!assigneeId) {
      setError("Pilih developer yang ditugaskan");
      return;
    }
    const slaIso = localInputToIso(slaDeadline);
    if (!slaIso) {
      setError("Deadline / SLA tidak valid");
      return;
    }

    setSaving(true);
    try {
      await tasksApi.create({
        website_id: websiteId,
        assignee_id: assigneeId,
        instruction_notes: instructionNotes.trim(),
        sla_deadline: slaIso,
      });
      setSuccess(
        attachmentName
          ? `Tugas untuk ${websiteName} berhasil dikirim. (Lampiran belum diunggah — akan tersedia di iterasi berikutnya.)`
          : `Tugas untuk ${websiteName} berhasil dikirim.`,
      );
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim tugas");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Delegasi tugas</h2>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: "0.9rem" }}>
        Kirim instruksi perbaikan atau tindak lanjut ke developer untuk website ini.
      </p>

      {error ? <ErrorBanner message={error} /> : null}
      {success ? <div className="success-banner">{success}</div> : null}

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="form-field full">
            <label htmlFor="task-notes">Catatan instruksi</label>
            <textarea
              id="task-notes"
              className="textarea"
              required
              rows={4}
              placeholder="Jelaskan masalah, langkah yang diharapkan, dan konteks singkat…"
              value={instructionNotes}
              onChange={(e) => setInstructionNotes(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="task-assignee">Assignee (Developer)</label>
            <Select
              id="task-assignee"
              className="block"
              value={assigneeId}
              onChange={setAssigneeId}
              disabled={loadingUsers}
              placeholder={loadingUsers ? "Memuat developer…" : "Pilih developer…"}
              options={assigneeOptions}
              aria-label="Pilih developer"
            />
          </div>

          <div className="form-field">
            <label htmlFor="task-sla">Deadline / SLA</label>
            <input
              id="task-sla"
              className="text-input block"
              type="datetime-local"
              required
              value={slaDeadline}
              onChange={(e) => setSlaDeadline(e.target.value)}
            />
          </div>

          <div className="form-field full">
            <label htmlFor="task-attachment">Lampiran (opsional)</label>
            <div className="attach-row">
              <input
                ref={fileInputRef}
                id="task-attachment"
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setAttachmentName(file?.name ?? "");
                }}
              />
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => fileInputRef.current?.click()}
              >
                Unggah file / gambar
              </button>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {attachmentName || "Belum ada file dipilih · upload object storage menyusul"}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving || loadingUsers}>
            {saving ? "Mengirim…" : "Kirim Tugas"}
          </button>
        </div>
      </form>
    </div>
  );
}
