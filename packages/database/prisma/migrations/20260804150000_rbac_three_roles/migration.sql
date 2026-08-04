-- Collapse UserRole to: end_user | developer | superadmin
-- Mapping:
--   it_ops, helpdesk     → superadmin
--   developer            → developer
--   business_owner, end_user → end_user

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('end_user', 'developer', 'superadmin');

ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "UserRole"
  USING (
    CASE
      WHEN "role"::text IN ('it_ops', 'helpdesk') THEN 'superadmin'::"UserRole"
      WHEN "role"::text = 'developer' THEN 'developer'::"UserRole"
      ELSE 'end_user'::"UserRole"
    END
  );

DROP TYPE "UserRole_old";
