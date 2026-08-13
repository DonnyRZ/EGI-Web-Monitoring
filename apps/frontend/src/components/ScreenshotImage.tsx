"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { monitoringApi } from "@/lib/api-services";

interface Props {
  resultId?: string | null;
  hasScreenshot?: boolean | null;
  signedUrl?: string | null;
  alt?: string;
  className?: string;
}

export function ScreenshotImage({
  resultId,
  hasScreenshot,
  signedUrl,
  alt = "Screenshot",
  className,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const load = useCallback(async () => {
    if (signedUrl) return;
    if (!resultId || !hasScreenshot) {
      setFetchedUrl(null);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await monitoringApi.screenshot(resultId);
      setFetchedUrl(res.url);
    } catch {
      setError(true);
      setFetchedUrl(null);
    } finally {
      setLoading(false);
    }
  }, [resultId, hasScreenshot, signedUrl]);

  useEffect(() => {
    if (!inView || signedUrl) return;
    void load();
  }, [inView, signedUrl, load]);

  if (!signedUrl && (!resultId || !hasScreenshot)) {
    return <div className={`placeholder ${className || ""}`}>Belum ada screenshot</div>;
  }

  const src = inView ? (signedUrl || fetchedUrl) : null;
  const waiting = !inView || (!src && loading);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height: "100%" }}>
      {waiting ? (
        <div className="placeholder">Memuat screenshot…</div>
      ) : error || !src ? (
        <div className="placeholder">Screenshot tidak tersedia</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      )}
    </div>
  );
}
