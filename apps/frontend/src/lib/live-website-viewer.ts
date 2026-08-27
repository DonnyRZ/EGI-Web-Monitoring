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
      return "Memuat website…";
    case "ready":
      return "Website siap digunakan.";
    case "slow":
      return "Website masih memuat. Jika area kosong, buka di tab baru.";
    case "unverified":
      return "Website belum bisa diverifikasi di dalam aplikasi. Buka di tab baru bila area kosong.";
  }
}
