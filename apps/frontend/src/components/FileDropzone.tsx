"use client";

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { IconPaperclip, IconX } from "./icons";

const DEFAULT_ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileDropzoneProps {
  id?: string;
  file: File | null;
  accept?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}

export function FileDropzone({
  id,
  file,
  accept = DEFAULT_ACCEPT,
  hint = "Gambar, PDF, Word, Excel, atau TXT",
  disabled = false,
  onChange,
}: FileDropzoneProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function applyFile(next: File | null) {
    onChange(next);
    if (!next && inputRef.current) inputRef.current.value = "";
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    applyFile(e.target.files?.[0] ?? null);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    applyFile(e.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="file-dropzone-wrap">
      <input
        ref={inputRef}
        id={inputId}
        className="sr-only"
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={onInputChange}
      />

      {file ? (
        <div className="file-dropzone-file">
          <span className="file-dropzone-icon" aria-hidden>
            <IconPaperclip />
          </span>
          <div className="file-dropzone-meta">
            <strong title={file.name}>{file.name}</strong>
            <span>{formatFileSize(file.size)}</span>
          </div>
          <button
            type="button"
            className="file-dropzone-remove"
            disabled={disabled}
            aria-label="Hapus lampiran"
            onClick={() => applyFile(null)}
          >
            <IconX />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`file-dropzone ${dragOver ? "is-dragover" : ""} ${disabled ? "is-disabled" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={onDrop}
        >
          <span className="file-dropzone-icon" aria-hidden>
            <IconPaperclip />
          </span>
          <span className="file-dropzone-copy">
            <strong>Pilih file atau seret ke sini</strong>
            <span>{hint}</span>
          </span>
        </label>
      )}
    </div>
  );
}
