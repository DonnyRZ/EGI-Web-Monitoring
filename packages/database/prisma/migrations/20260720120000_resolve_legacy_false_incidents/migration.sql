-- Incidents created by the old rule could represent repeated performance
-- warnings even when every stored probe reached the website successfully.
-- Resolve only those active incidents with no hard-down evidence since start.
WITH legacy_false_incidents AS (
  SELECT i.id
  FROM "incidents" i
  WHERE i.status IN ('open', 'in_progress')
    AND NOT EXISTS (
      SELECT 1
      FROM "monitoring_results" mr
      WHERE mr.website_id = i.website_id
        AND mr.scheduled_at >= i.started_at
        AND mr.raw_status = 'down'::"MonitoringStatus"
    )
)
UPDATE "tickets" t
SET status = 'resolved'::"TicketStatus",
    resolved_at = COALESCE(t.resolved_at, now()),
    updated_at = now()
WHERE t.incident_id IN (SELECT id FROM legacy_false_incidents)
  AND t.status IN ('open', 'in_progress');

UPDATE "incidents" i
SET status = 'resolved'::"IncidentStatus",
    resolved_at = COALESCE(i.resolved_at, now()),
    updated_at = now()
WHERE i.status IN ('open', 'in_progress')
  AND NOT EXISTS (
    SELECT 1
    FROM "monitoring_results" mr
    WHERE mr.website_id = i.website_id
      AND mr.scheduled_at >= i.started_at
      AND mr.raw_status = 'down'::"MonitoringStatus"
  );
