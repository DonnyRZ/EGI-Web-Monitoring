ALTER TABLE "monitoring_results"
  ADD COLUMN "raw_status" "MonitoringStatus",
  ADD COLUMN "http_ok" BOOLEAN,
  ADD COLUMN "browser_ok" BOOLEAN,
  ADD COLUMN "screenshot_ok" BOOLEAN,
  ADD COLUMN "probe_aborted" BOOLEAN,
  ADD COLUMN "infrastructure_failure" BOOLEAN,
  ADD COLUMN "status_reason" TEXT;

-- Existing `down` rows were produced by the old rule that escalated repeated
-- warnings. Preserve hard-down only when the stored evidence indicates that
-- HTTP was not successful or no screenshot was produced.
UPDATE "monitoring_results"
SET
  "raw_status" = CASE
    WHEN "status" = 'unknown' THEN 'unknown'::"MonitoringStatus"
    WHEN "status" = 'down' AND "http_status" BETWEEN 200 AND 399 AND "screenshot_url" IS NOT NULL THEN 'warning'::"MonitoringStatus"
    ELSE "status"
  END,
  "http_ok" = ("http_status" BETWEEN 200 AND 399),
  "screenshot_ok" = ("screenshot_url" IS NOT NULL),
  "probe_aborted" = ("status" = 'unknown'),
  "infrastructure_failure" = ("status" = 'unknown'),
  "status_reason" = CASE
    WHEN "status" = 'unknown' THEN 'legacy_unknown'
    WHEN "status" = 'down' AND "http_status" BETWEEN 200 AND 399 AND "screenshot_url" IS NOT NULL THEN 'legacy_slow_or_partial_failure'
    WHEN "status" = 'down' THEN 'legacy_hard_failure'
    WHEN "status" = 'warning' THEN 'legacy_warning'
    ELSE 'legacy_healthy'
  END;
