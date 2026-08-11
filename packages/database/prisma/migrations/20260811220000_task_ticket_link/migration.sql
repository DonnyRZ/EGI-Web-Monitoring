ALTER TABLE "tasks" ALTER COLUMN "sla_deadline" DROP NOT NULL;
ALTER TABLE "tasks" ADD COLUMN "ticket_id" UUID;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ticket_id_key" UNIQUE ("ticket_id");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
