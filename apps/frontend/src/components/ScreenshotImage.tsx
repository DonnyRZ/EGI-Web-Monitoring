"use client";

import { useCallback, useEffect, useState } from "react";
import { monitoringApi } from "@/lib/api-services";

interface Props {
  resultId?: string | null;
  hasScreenshot?: boolean | null;
  alt?: string;
  className?: string;
}

export function ScreenshotImage({
  resultId,
  hasScreenshot,
  alt = "Screenshot",
  className,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!resultId || !hasScreenshot) {
      setUrl(null);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await monitoringApi.screenshot(resultId);
      setUrl(res.url);
    } catch {
      setError(true);
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }, [resultId, hasScreenshot]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!resultId || !hasScreenshot) {
    return <div className={`placeholder ${className || ""}`}>Belum ada screenshot</div>;
  }

  if (loading) {
    return <div className={`placeholder ${className || ""}`}>Memuat screenshot…</div>;
  }

  if (error || !url) {
    return <div className={`placeholder ${className || ""}`}>Screenshot tidak tersedia</div>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} />
  );
}
