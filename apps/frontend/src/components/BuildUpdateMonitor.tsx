"use client";

import { useCallback, useEffect, useState } from "react";
import { getBuildUpdateAction } from "@/lib/build-update";
import { useUnsavedChangesState } from "@/lib/unsaved-changes";

const BUILD_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "development";
const VERSION_CHECK_INTERVAL_MS = 60_000;
const RELOAD_GUARD_KEY = "egi_build_reload_attempt";

type VersionResponse = { version?: unknown };

function readReloadAttempt() {
  try {
    return window.sessionStorage.getItem(RELOAD_GUARD_KEY);
  } catch {
    return null;
  }
}

function writeReloadAttempt(version: string) {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, version);
    return true;
  } catch {
    return false;
  }
}

function clearReloadAttempt() {
  try {
    window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    // Storage restrictions must never block the application.
  }
}

export function BuildUpdateMonitor() {
  const { hasUnsavedChanges } = useUnsavedChangesState();
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  const checkVersion = useCallback(async () => {
    if (BUILD_VERSION === "development") return;

    try {
      const response = await fetch("/app-version", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;

      const payload = (await response.json()) as VersionResponse;
      const latestVersion = typeof payload.version === "string" ? payload.version : "";
      const action = getBuildUpdateAction(BUILD_VERSION, latestVersion, hasUnsavedChanges, readReloadAttempt());
      if (action === "none") {
        clearReloadAttempt();
        setAvailableVersion(null);
        return;
      }

      if (action === "reload" && writeReloadAttempt(latestVersion)) {
        window.location.reload();
        return;
      }
      setAvailableVersion(latestVersion);
    } catch {
      // Version checks are best-effort and must never block page rendering.
    }
  }, [hasUnsavedChanges]);

  useEffect(() => {
    void checkVersion();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkVersion();
    }, VERSION_CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkVersion]);

  if (!availableVersion) return null;

  function reloadToLatest() {
    const version = availableVersion;
    if (!version) return;
    if (hasUnsavedChanges && !window.confirm("Perubahan yang belum disimpan akan hilang. Muat versi terbaru sekarang?")) {
      return;
    }
    writeReloadAttempt(version);
    window.location.reload();
  }

  return (
    <div className="app-update-banner" role="alert">
      <span>Versi aplikasi terbaru tersedia.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={reloadToLatest}>
        Muat versi terbaru
      </button>
    </div>
  );
}
