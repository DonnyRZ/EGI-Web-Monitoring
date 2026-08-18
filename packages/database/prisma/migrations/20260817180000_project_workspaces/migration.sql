CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "ProjectMemberType" AS ENUM ('pic_web', 'developer');
CREATE TYPE "UserStoryStatus" AS ENUM ('backlog', 'ready', 'in_progress', 'review', 'done', 'blocked');
CREATE TYPE "UserStoryPriority" AS ENUM ('critical', 'high', 'medium', 'low');

CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "pic_developer_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "member_type" "ProjectMemberType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_stories" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "website_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "acceptance_criteria" TEXT,
    "priority" "UserStoryPriority" NOT NULL DEFAULT 'medium',
    "status" "UserStoryStatus" NOT NULL DEFAULT 'backlog',
    "primary_developer_id" UUID,
    "due_date" TIMESTAMP(3),
    "created_by_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_collaborators" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_collaborators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "websites" ADD COLUMN "project_id" UUID;
ALTER TABLE "tickets" ADD COLUMN "project_id" UUID;
ALTER TABLE "tickets" ADD COLUMN "user_story_id" UUID;

CREATE INDEX "projects_status_idx" ON "projects"("status");
CREATE INDEX "projects_pic_developer_id_idx" ON "projects"("pic_developer_id");
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");
CREATE INDEX "project_members_user_id_member_type_idx" ON "project_members"("user_id", "member_type");
CREATE INDEX "websites_project_id_idx" ON "websites"("project_id");
CREATE INDEX "tickets_project_id_idx" ON "tickets"("project_id");
CREATE INDEX "tickets_user_story_id_idx" ON "tickets"("user_story_id");
CREATE INDEX "user_stories_project_id_idx" ON "user_stories"("project_id");
CREATE INDEX "user_stories_website_id_idx" ON "user_stories"("website_id");
CREATE INDEX "user_stories_primary_developer_id_idx" ON "user_stories"("primary_developer_id");
CREATE INDEX "user_stories_status_idx" ON "user_stories"("status");
CREATE INDEX "user_stories_due_date_idx" ON "user_stories"("due_date");
CREATE UNIQUE INDEX "story_collaborators_story_id_user_id_key" ON "story_collaborators"("story_id", "user_id");
CREATE INDEX "story_collaborators_user_id_idx" ON "story_collaborators"("user_id");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_pic_developer_id_fkey"
  FOREIGN KEY ("pic_developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "websites"
  ADD CONSTRAINT "websites_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_user_story_id_fkey"
  FOREIGN KEY ("user_story_id") REFERENCES "user_stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_stories"
  ADD CONSTRAINT "user_stories_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_stories"
  ADD CONSTRAINT "user_stories_website_id_fkey"
  FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_stories"
  ADD CONSTRAINT "user_stories_primary_developer_id_fkey"
  FOREIGN KEY ("primary_developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_stories"
  ADD CONSTRAINT "user_stories_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "story_collaborators"
  ADD CONSTRAINT "story_collaborators_story_id_fkey"
  FOREIGN KEY ("story_id") REFERENCES "user_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_collaborators"
  ADD CONSTRAINT "story_collaborators_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
