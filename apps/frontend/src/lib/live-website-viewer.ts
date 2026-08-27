export type LiveViewerPhase =
  | "invalid"
  | "loading"
  | "ready"
  | "slow"
  | "unverified";

/**
 * This is a UI hint, not a network timeout. The iframe stays mounted after
 * this threshold because cross-origin load events cannot prove that a page is
 * usable (or that a frame policy blocked it).
 */
export const LIVE_VIEWER_SLOW_THRESHOLD_MS = 10_000;

export function initialLiveViewerPhase(hasValidUrl: boolean): LiveViewerPhase {
  return hasValidUrl ? "loading" : "invalid";
}

export function markLiveViewerSlow(phase: LiveViewerPhase): LiveViewerPhase {
  return phase === "loading" ? "slow" : phase;
}

export function markLiveViewerReady(hasValidUrl: boolean): LiveViewerPhase {
  return hasValidUrl ? "ready" : "invalid";
}

export function markLiveViewerUnverified(hasValidUrl: boolean): LiveViewerPhase {
  return hasValidUrl ? "unverified" : "invalid";
}

export function shouldRenderLiveViewerFrame(hasValidUrl: boolean) {
  return hasValidUrl;
}

export function canRetryLiveViewer(phase: LiveViewerPhase) {
  return phase === "slow" || phase === "unverified";
}

export function liveViewerStatusMessage(phase: LiveViewerPhase) {
  switch (phase) {
    case "invalid":
      return "URL website belum valid.";
    case "loading":
      return "Memuat tampilan website…";
    case "ready":
      return "Tampilan website tersedia.";
    case "slow":
      return "Tampilan masih dimuat. Jika area kosong, buka di tab baru.";
    case "unverified":
      return "Tampilan belum bisa diverifikasi di dalam aplikasi. Jika area kosong, buka di tab baru.";
  }
}
