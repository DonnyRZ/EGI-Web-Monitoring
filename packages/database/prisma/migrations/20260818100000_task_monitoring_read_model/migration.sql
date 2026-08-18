CREATE TYPE "TaskBusinessStatus" AS ENUM ('new', 'in_progress', 'waiting_pic', 'blocked', 'done');

ALTER TABLE "tickets"
  ADD COLUMN "task_status_override" "TaskBusinessStatus",
  ADD COLUMN "task_status_override_by" UUID,
  ADD COLUMN "task_status_override_at" TIMESTAMP(3);

CREATE TABLE "ticket_user_story_links" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_story_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_user_story_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_user_story_links_ticket_id_user_story_id_key"
  ON "ticket_user_story_links"("ticket_id", "user_story_id");
CREATE INDEX "ticket_user_story_links_user_story_id_idx"
  ON "ticket_user_story_links"("user_story_id");
CREATE INDEX "tickets_task_status_override_idx"
  ON "tickets"("task_status_override");

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_task_status_override_by_fkey"
  FOREIGN KEY ("task_status_override_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_user_story_links"
  ADD CONSTRAINT "ticket_user_story_links_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ticket_user_story_links_user_story_id_fkey"
  FOREIGN KEY ("user_story_id") REFERENCES "user_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ticket_user_story_links" ("id", "ticket_id", "user_story_id")
SELECT md5(random()::text || clock_timestamp()::text)::uuid, "id", "user_story_id"
FROM "tickets"
WHERE "user_story_id" IS NOT NULL
ON CONFLICT ("ticket_id", "user_story_id") DO NOTHING;
