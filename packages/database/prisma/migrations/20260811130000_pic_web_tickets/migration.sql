CREATE TYPE "TicketCategory" AS ENUM ('website', 'help_desk', 'procurement');

ALTER TABLE "tickets"
  ALTER COLUMN "incident_id" DROP NOT NULL,
  ADD COLUMN "website_id" UUID,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "category" "TicketCategory",
  ADD COLUMN "description" TEXT,
  ADD COLUMN "attachment_url" TEXT,
  ADD COLUMN "sla_deadline" TIMESTAMP(3);

CREATE INDEX "tickets_website_id_idx" ON "tickets"("website_id");
CREATE INDEX "tickets_created_by_idx" ON "tickets"("created_by");
CREATE INDEX "tickets_sla_deadline_idx" ON "tickets"("sla_deadline");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
