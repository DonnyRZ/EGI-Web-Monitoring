"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconExternal, IconRefresh, IconX } from "@/components/icons";
import type { Website } from "@/lib/types";
import {
  canRetryLiveViewer,
  initialLiveViewerPhase,
  LIVE_VIEWER_SLOW_THRESHOLD_MS,
  liveViewerStatusMessage,
  markLiveViewerReady,
  markLiveViewerSlow,
  markLiveViewerUnverified,
  shouldRenderLiveViewerFrame,
  type LiveViewerPhase,
} from "@/lib/live-website-viewer";
import { normalizeLiveWebsiteUrl } from "@/lib/website-experience";

type LiveWebsiteViewerProps = {
  website: Pick<Website, "id" | "name" | "domain" | "url">;
  publicView?: boolean;
  onClose?: () => void;
};

export function LiveWebsiteViewer({
  website,
  publicView = false,
  onClose,
}: LiveWebsiteViewerProps) {
  const normalized = useMemo(() => normalizeLiveWebsiteUrl(website.url), [website.url]);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<LiveViewerPhase>(() => initialLiveViewerPhase(Boolean(normalized)));
  const timeoutRef = useRef<number | null>(null);

  const clearViewerTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearViewerTimeout();
    setPhase(initialLiveViewerPhase(Boolean(normalized)));
    if (!normalized) return;

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setPhase((current) => markLiveViewerSlow(current));
    }, LIVE_VIEWER_SLOW_THRESHOLD_MS);
    return clearViewerTimeout;
  }, [clearViewerTimeout, normalized, attempt]);

  function retry() {
    if (!normalized) return;
    setPhase("loading");
    setAttempt((current) => current + 1);
  }

  const hasValidUrl = Boolean(normalized);
  const statusMessage = liveViewerStatusMessage(hasValidUrl ? phase : "invalid");

  return (
    <section className={`live-website-viewer${publicView ? " public-view" : ""}`} aria-label={`Tampilan ${website.name}`}>
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

      <div className="live-website-viewer-status" aria-live="polite">
        <p className="live-website-viewer-note">{statusMessage}</p>
        {hasValidUrl && canRetryLiveViewer(phase) ? (
          <button type="button" className="btn btn-sm btn-neutral" onClick={retry}>
            <IconRefresh />
            Coba lagi
          </button>
        ) : null}
      </div>

      <div className="live-website-viewer-frame" aria-busy={phase === "loading"}>
        {shouldRenderLiveViewerFrame(hasValidUrl) && normalized ? (
          <iframe
            key={`${website.id}-${attempt}`}
            src={normalized.href}
            title={`Tampilan interaktif ${website.name}`}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              clearViewerTimeout();
              setPhase(markLiveViewerReady(hasValidUrl));
            }}
            onError={() => {
              clearViewerTimeout();
              // Keep the frame mounted. Cross-origin iframe errors are not a
              // reliable signal, and removing it would hide a page that may
              // still be usable or still loading.
              setPhase(markLiveViewerUnverified(hasValidUrl));
            }}
          />
        ) : (
          <div className="live-website-viewer-fallback" role="status">
            <strong>URL website belum valid</strong>
            <p>{statusMessage}</p>
          </div>
        )}
        {phase === "loading" ? <div className="live-website-viewer-loading" aria-hidden>Memuat tampilan…</div> : null}
      </div>
    </section>
  );
}
