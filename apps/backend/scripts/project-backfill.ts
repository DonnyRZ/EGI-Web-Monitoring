import { PrismaClient, ProjectStatus, ProjectMemberType, UserRole } from "@egi/database";
import { writeFileSync } from "node:fs";

/**
 * Project migration preflight/backfill.
 *
 * Safe default is a read-only dry-run. Applying requires two explicit
 * environment flags so a production operator cannot accidentally mutate the
 * database while inspecting the report.
 *
 * Dry-run:
 *   npx tsx apps/backend/scripts/project-backfill.ts
 * Apply after a verified database backup:
 *   PROJECT_BACKFILL_APPLY=YES PROJECT_BACKFILL_BACKUP=VERIFIED \
 *   npx tsx apps/backend/scripts/project-backfill.ts
 */

const prisma = new PrismaClient();

const REQUIRED_SCHEMA_COLUMNS = [
  "projects.id",
  "project_members.project_id",
  "user_stories.project_id",
  "story_collaborators.story_id",
  "websites.project_id",
  "tickets.project_id",
  "tickets.user_story_id",
] as const;

type AssignmentIssue = {
  website: string;
  field: "owner_id" | "it_pic_id" | "backup_it_pic_id";
  user_id: string;
  reason: string;
};

type TicketProjectConflict = {
  ticket_id: string;
  website_id: string;
  website_project_id: string;
  ticket_project_id: string;
};

async function assertSchemaReady() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'projects' AND column_name = 'id') OR
        (table_name = 'project_members' AND column_name = 'project_id') OR
        (table_name = 'user_stories' AND column_name = 'project_id') OR
        (table_name = 'story_collaborators' AND column_name = 'story_id') OR
        (table_name = 'websites' AND column_name = 'project_id') OR
        (table_name = 'tickets' AND column_name IN ('project_id', 'user_story_id'))
      )
  `;
  const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = REQUIRED_SCHEMA_COLUMNS.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(
      `Project schema is not ready. Missing: ${missing.join(", ")}. Apply the additive Prisma migration first; this script never migrates the database itself.`,
    );
  }
}

async function main() {
  const apply = process.env.PROJECT_BACKFILL_APPLY === "YES";
  if (apply && process.env.PROJECT_BACKFILL_BACKUP !== "VERIFIED") {
    throw new Error("Refusing to apply: set PROJECT_BACKFILL_BACKUP=VERIFIED only after a tested database backup");
  }

  await assertSchemaReady();

  const [websites, users, ticketCount, generalTicketCount, taskCount] = await Promise.all([
    prisma.website.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        projectId: true,
        ownerId: true,
        itPicId: true,
        backupItPicId: true,
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true, role: true, isActive: true } }),
    prisma.ticket.count({ where: { websiteId: { not: null }, projectId: null } }),
    prisma.ticket.count({ where: { websiteId: null, projectId: null } }),
    prisma.task.count(),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const issues: AssignmentIssue[] = [];
  const projectsToCreate = websites.filter((website) => !website.projectId);
  const alreadyLinked = websites.length - projectsToCreate.length;
  const [existingProjects, ticketProjectConflicts] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true, status: true } }),
    prisma.$queryRaw<TicketProjectConflict[]>`
      SELECT
        t.id AS ticket_id,
        t.website_id,
        w.project_id AS website_project_id,
        t.project_id AS ticket_project_id
      FROM tickets t
      INNER JOIN websites w ON w.id = t.website_id
      WHERE t.project_id IS NOT NULL
        AND w.project_id IS NOT NULL
        AND t.project_id <> w.project_id
    `,
  ]);
  const projectNameConflicts = projectsToCreate.flatMap((website) =>
    existingProjects
      .filter((project) => project.name === website.name)
      .map((project) => ({
        website: website.name,
        existing_project_id: project.id,
        reason: "an unlinked website has the same name as an existing project",
      })),
  );
  const projectStatusConflicts = websites.flatMap((website) => {
    if (!website.projectId) return [];
    const project = existingProjects.find((candidate) => candidate.id === website.projectId);
    const expectedStatus = website.isActive ? ProjectStatus.active : ProjectStatus.archived;
    return project && project.status !== expectedStatus
      ? [{ website: website.name, project_id: project.id, expected_status: expectedStatus, actual_status: project.status }]
      : [];
  });
  const mappings = websites.map((website) => {
    const owner = website.ownerId ? usersById.get(website.ownerId) : null;
    const itPic = website.itPicId ? usersById.get(website.itPicId) : null;
    const backup = website.backupItPicId ? usersById.get(website.backupItPicId) : null;

    if (website.ownerId && (!owner || owner.role !== UserRole.pic_web || !owner.isActive)) {
      issues.push({ website: website.name, field: "owner_id", user_id: website.ownerId, reason: "user missing, inactive, or not pic_web" });
    }
    if (website.itPicId && (!itPic || itPic.role !== UserRole.developer || !itPic.isActive)) {
      issues.push({ website: website.name, field: "it_pic_id", user_id: website.itPicId, reason: "user missing, inactive, or not developer" });
    }
    if (website.backupItPicId && (!backup || backup.role !== UserRole.developer || !backup.isActive)) {
      issues.push({ website: website.name, field: "backup_it_pic_id", user_id: website.backupItPicId, reason: "user missing, inactive, or not developer" });
    }

    const projectName = website.name;
    const projectStatus = website.isActive ? ProjectStatus.active : ProjectStatus.archived;
    return {
      website,
      owner: owner && owner.role === UserRole.pic_web && owner.isActive ? owner : null,
      itPic: itPic && itPic.role === UserRole.developer && itPic.isActive ? itPic : null,
      backup: backup && backup.role === UserRole.developer && backup.isActive ? backup : null,
      projectName,
      projectStatus,
    };
  });

  const report = {
    mode: apply ? "APPLY" : "DRY-RUN",
    website_total: websites.length,
    websites_without_project: projectsToCreate.length,
    projects_to_create: projectsToCreate.length,
    websites_already_linked: alreadyLinked,
    active_projects: websites.filter((website) => website.isActive).length,
    archived_projects: websites.filter((website) => !website.isActive).length,
    valid_pic_web_assignments: mappings.filter((row) => row.owner).length,
    valid_pic_developer_assignments: mappings.filter((row) => row.itPic).length,
    valid_developer_team_assignments: mappings.filter((row) => row.backup && row.backup.id !== row.itPic?.id).length,
    assignment_issues: issues,
    tickets_with_website_to_link: ticketCount,
    general_tickets_without_project: generalTicketCount,
    legacy_tasks_to_preserve: taskCount,
    user_stories_to_create: 0,
    project_name_conflicts: projectNameConflicts,
    project_status_conflicts: projectStatusConflicts,
    ticket_project_conflicts: ticketProjectConflicts,
  };
  const reportFile = process.env.PROJECT_BACKFILL_REPORT_FILE;
  if (reportFile) {
    writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  }
  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.log("Dry-run only. No database rows were changed.");
    return;
  }
  if (issues.length > 0) {
    throw new Error("Refusing to apply because invalid legacy assignments need review");
  }
  if (projectNameConflicts.length > 0) {
    throw new Error("Refusing to apply because existing project-name conflicts need review");
  }
  if (projectStatusConflicts.length > 0) {
    throw new Error("Refusing to apply because linked project statuses need review");
  }
  if (ticketProjectConflicts.length > 0) {
    throw new Error("Refusing to apply because ticket/project links are inconsistent");
  }

  await prisma.$transaction(async (tx) => {
    const projectIds = new Map<string, string>();
    for (const row of mappings) {
      const project = row.website.projectId
        ? await tx.project.findUnique({ where: { id: row.website.projectId }, select: { id: true } })
        : await tx.project.create({
            data: {
              name: row.projectName,
              status: row.projectStatus,
            },
            select: { id: true },
          });
      if (!project) throw new Error(`Project for website ${row.website.name} no longer exists`);
      projectIds.set(row.website.id, project.id);

      await tx.website.update({ where: { id: row.website.id }, data: { projectId: project.id } });
      await tx.project.update({ where: { id: project.id }, data: { picDeveloperId: row.itPic?.id ?? null } });
      await tx.projectMember.deleteMany({ where: { projectId: project.id } });
      const members = [
        row.owner ? { projectId: project.id, userId: row.owner.id, memberType: ProjectMemberType.pic_web } : null,
        row.backup && row.backup.id !== row.itPic?.id
          ? { projectId: project.id, userId: row.backup.id, memberType: ProjectMemberType.developer }
          : null,
      ].filter((member): member is { projectId: string; userId: string; memberType: ProjectMemberType } => Boolean(member));
      if (members.length > 0) await tx.projectMember.createMany({ data: members });
    }

    for (const [websiteId, projectId] of projectIds) {
      await tx.ticket.updateMany({ where: { websiteId, projectId: null }, data: { projectId } });
    }
  });
  console.log("Backfill applied successfully. User Stories were not generated from history.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
