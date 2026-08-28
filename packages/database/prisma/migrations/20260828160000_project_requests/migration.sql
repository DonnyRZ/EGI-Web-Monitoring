-- Keep Project requests separate from Tasks/Tickets. No existing rows are
-- backfilled, changed, or deleted by this migration.

CREATE TYPE "ProjectRequestStatus" AS ENUM ('pending', 'needs_info', 'approved', 'rejected');

CREATE SEQUENCE "project_request_number_seq";

CREATE OR REPLACE FUNCTION "generate_project_request_number"()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'PRJ-'
    || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD-HH24MI')
    || '-'
    || lpad(nextval('"project_request_number_seq"')::text, 6, '0');
$$;

CREATE TABLE "project_requests" (
    "id" UUID NOT NULL,
    "request_number" VARCHAR(32) NOT NULL DEFAULT "generate_project_request_number"(),
    "requested_name" VARCHAR(150) NOT NULL,
    "briefing" TEXT NOT NULL,
    "expected_outcome" TEXT NOT NULL,
    "proposed_website_name" VARCHAR(150),
    "proposed_domain" VARCHAR(255),
    "attachment_url" TEXT,
    "status" "ProjectRequestStatus" NOT NULL DEFAULT 'pending',
    "submitted_by_id" UUID NOT NULL,
    "review_note" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "project_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_requests_request_number_key" ON "project_requests"("request_number");
CREATE UNIQUE INDEX "project_requests_project_id_key" ON "project_requests"("project_id");
CREATE INDEX "project_requests_status_idx" ON "project_requests"("status");
CREATE INDEX "project_requests_submitted_by_id_created_at_idx" ON "project_requests"("submitted_by_id", "created_at");

ALTER TABLE "project_requests"
  ADD CONSTRAINT "project_requests_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_requests"
  ADD CONSTRAINT "project_requests_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_requests"
  ADD CONSTRAINT "project_requests_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
