"use client";

import { FormEvent, useMemo, useState } from "react";
import { Select } from "@/components/Select";
import { ErrorBanner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { tasksApi } from "@/lib/api-services";
import type { Task, Website } from "@/lib/types";

interface AddPersonalTaskModalProps {
  websites: Website[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}

function localInputToIso(value: string) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function AddPersonalTaskModal({
  websites,
  currentUserId,
  onClose,
  onCreated,
}: AddPersonalTaskModalProps) {
  const mySites = useMemo(
    () =>
      websites.filter(
        (w) => w.it_pic_id === currentUserId || w.backup_it_pic_id === currentUserId,
      ),
    [websites, currentUserId],
  );

  const [websiteId, setWebsiteId] = useState(mySites.length === 1 ? mySites[0].id : "");
  const [instructionNotes, setInstructionNotes] = useState("");
  const [slaDeadline, setSlaDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const websiteOptions = mySites.map((w) => ({ value: w.id, label: `${w.name} (${w.domain})` }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!websiteId) {
      setError("Pilih website terlebih dahulu");
      return;
    }
    if (!instructionNotes.trim()) {
      setError("Catatan tugas wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const task = await tasksApi.create({
        website_id: websiteId,
        instruction_notes: instructionNotes.trim(),
        sla_deadline: localInputToIso(slaDeadline),
      });
      onCreated(task);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambahkan to-do");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Tambah To-Do</h2>
        <p className="muted" style={{ margin: "0 0 14px", fontSize: "0.9rem" }}>
          Catat arahan yang Anda terima langsung (WA, meeting, dll) untuk website yang Anda pegang.
        </p>

        {error ? <ErrorBanner message={error} /> : null}

        {mySites.length === 0 ? (
          <p className="muted">
            Anda belum menjadi IT PIC atau backup PIC di website manapun, jadi belum bisa
            menambahkan to-do manual.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="personal-task-website">Website</label>
                <Select
                  id="personal-task-website"
                  className="block"
                  value={websiteId}
                  onChange={setWebsiteId}
                  placeholder="Pilih website…"
                  options={websiteOptions}
                  aria-label="Pilih website"
                />
              </div>

              <div className="form-field full">
                <label htmlFor="personal-task-notes">Task</label>
                <textarea
                  id="personal-task-notes"
                  className="textarea"
                  required
                  rows={4}
                  placeholder="Arahan dari Bos IT lewat WA, hasil meeting, dll…"
                  value={instructionNotes}
                  onChange={(e) => setInstructionNotes(e.target.value)}
                />
              </div>

              <div className="form-field full">
                <label htmlFor="personal-task-sla">Deadline (opsional)</label>
                <input
                  id="personal-task-sla"
                  className="text-input block"
                  type="datetime-local"
                  value={slaDeadline}
                  onChange={(e) => setSlaDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-neutral" onClick={onClose} disabled={saving}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan To-Do"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
