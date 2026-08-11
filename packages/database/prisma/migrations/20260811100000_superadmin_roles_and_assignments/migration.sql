ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'pic_web';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'bos_it';

ALTER TABLE "websites"
  ADD COLUMN "it_pic_id" UUID,
  ADD COLUMN "backup_it_pic_id" UUID;

CREATE INDEX "websites_it_pic_id_idx" ON "websites"("it_pic_id");
CREATE INDEX "websites_backup_it_pic_id_idx" ON "websites"("backup_it_pic_id");

ALTER TABLE "websites"
  ADD CONSTRAINT "websites_it_pic_id_fkey"
  FOREIGN KEY ("it_pic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "websites"
  ADD CONSTRAINT "websites_backup_it_pic_id_fkey"
  FOREIGN KEY ("backup_it_pic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
