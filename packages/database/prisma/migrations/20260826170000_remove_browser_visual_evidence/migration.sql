-- Health monitoring is HTTP-only. Historical migrations remain immutable;
-- this cleanup release removes only browser/render/screenshot evidence.
UPDATE "monitoring_results"
SET "status_reason" = CASE
  WHEN "status_reason" IN ('http_and_browser_failed', 'browser_failed', 'screenshot_failed')
    THEN CASE WHEN "http_ok" = false OR "status" = 'down' THEN 'http_failed' ELSE 'health_check' END
  WHEN "status_reason" = 'slow_render'
    THEN CASE WHEN "response_time_ms" >= 5000 THEN 'slow_http' ELSE 'health_check' END
  ELSE "status_reason"
END
WHERE "status_reason" IN (
  'http_and_browser_failed',
  'browser_failed',
  'screenshot_failed',
  'slow_render'
);

ALTER TABLE "monitoring_results"
  DROP COLUMN IF EXISTS "browser_ok",
  DROP COLUMN IF EXISTS "screenshot_ok",
  DROP COLUMN IF EXISTS "render_time_ms",
  DROP COLUMN IF EXISTS "screenshot_url";
