"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconExternal, IconRefresh, IconX } from "@/components/icons";
import type { Website } from "@/lib/types";
import { normalizeLiveWebsiteUrl } from "@/lib/website-experience";

type ViewerPhase = "loading" | "ready" | "timeout" | "error";

type LiveWebsiteViewerProps = {
  website: Pick<Website, "id" | "name" | "domain" | "url">;
  publicView?: boolean;
  onClose?: () => void;
};

const VIEWER_TIMEOUT_MS = 10_000;

export function LiveWebsiteViewer({
  website,
  publicView = false,
  onClose,
}: LiveWebsiteViewerProps) {
  const normalized = useMemo(() => normalizeLiveWebsiteUrl(website.url), [website.url]);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<ViewerPhase>(normalized ? "loading" : "error");
  const timeoutRef = useRef<number | null>(null);

  const clearViewerTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearViewerTimeout();
    setPhase(normalized ? "loading" : "error");
    if (!normalized) return;

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setPhase("timeout");
    }, VIEWER_TIMEOUT_MS);
    return clearViewerTimeout;
  }, [clearViewerTimeout, normalized, attempt]);

  function retry() {
    setAttempt((current) => current + 1);
  }

  const canRenderFrame = Boolean(normalized) && (phase === "loading" || phase === "ready");
  const statusMessage = phase === "loading"
    ? "Memuat tampilan website…"
    : phase === "ready"
      ? "Tampilan website siap digunakan."
      : phase === "timeout"
        ? "Website belum merespons di dalam aplikasi."
        : "Tampilan website tidak dapat dibuka di dalam aplikasi.";

  return (
    <section className="live-website-viewer" aria-label={`Tampilan ${website.name}`}>
      <header className="live-website-viewer-header">
        <div className="live-website-viewer-heading">
          <span className="eyebrow">Tampilan Website</span>
          <h2>{website.name}</h2>
          <span className="muted live-website-viewer-domain">{website.domain}</span>
        </div>
        <div className="live-website-viewer-actions">
          {normalized ? (
            <a
              className="btn btn-sm btn-neutral"
              href={normalized.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconExternal />
              Buka di tab baru
            </a>
          ) : null}
          {onClose ? (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup tampilan website">
              <IconX />
            </button>
          ) : null}
        </div>
      </header>

      <div className="live-website-viewer-frame" aria-busy={phase === "loading"}>
        {canRenderFrame && normalized ? (
          <iframe
            key={`${website.id}-${attempt}`}
            src={normalized.href}
            title={`Tampilan interaktif ${website.name}`}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              clearViewerTimeout();
              setPhase("ready");
            }}
            onError={() => {
              clearViewerTimeout();
              setPhase("error");
            }}
          />
        ) : (
          <div className="live-website-viewer-fallback" role="status">
            <strong>{phase === "error" && !normalized ? "URL website belum valid" : "Website belum bisa ditampilkan di sini"}</strong>
            <p>{statusMessage}</p>
            <div className="live-website-viewer-fallback-actions">
              {normalized ? (
                <button type="button" className="btn btn-primary" onClick={retry}>
                  <IconRefresh />
                  Coba lagi
                </button>
              ) : null}
              {normalized ? (
                <a className="btn btn-neutral" href={normalized.href} target="_blank" rel="noopener noreferrer">
                  <IconExternal />
                  Buka di tab baru
                </a>
              ) : null}
            </div>
          </div>
        )}
        {phase === "loading" ? <div className="live-website-viewer-loading" aria-hidden>Memuat tampilan…</div> : null}
      </div>

      <p className="live-website-viewer-note" aria-live="polite">
        {statusMessage}
        {!publicView && phase === "timeout" ? " Gunakan tab baru bila website membatasi tampilan di dalam aplikasi." : ""}
      </p>
    </section>
  );
}
