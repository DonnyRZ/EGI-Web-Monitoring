-- Add a stable human-readable identity and an explicit path for new website requests.
-- Existing ticket rows are backfilled; no ticket, task, project, or website data is deleted.

ALTER TYPE "TicketCategory" ADD VALUE 'new_website';

CREATE SEQUENCE "ticket_number_seq";

CREATE OR REPLACE FUNCTION "generate_ticket_number"()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'TASK-'
    || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD-HH24MI')
    || '-'
    || lpad(nextval('"ticket_number_seq"')::text, 6, '0');
$$;

ALTER TABLE "tickets"
  ADD COLUMN "ticket_number" VARCHAR(32),
  ADD COLUMN "requested_website_name" VARCHAR(150),
  ADD COLUMN "requested_domain" VARCHAR(255),
  ADD COLUMN "requested_project_name" VARCHAR(150);

WITH ordered_tickets AS (
  SELECT
    "id",
    'TASK-'
      || to_char("created_at" AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD-HH24MI')
      || '-'
      || lpad(nextval('"ticket_number_seq"')::text, 6, '0') AS "number"
  FROM "tickets"
  WHERE "ticket_number" IS NULL
  ORDER BY "created_at", "id"
)
UPDATE "tickets" AS ticket
SET "ticket_number" = ordered."number"
FROM ordered_tickets AS ordered
WHERE ticket."id" = ordered."id";

ALTER TABLE "tickets"
  ALTER COLUMN "ticket_number" SET DEFAULT "generate_ticket_number"(),
  ALTER COLUMN "ticket_number" SET NOT NULL;

CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");
