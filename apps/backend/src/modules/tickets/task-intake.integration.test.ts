import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, TicketCategory, UserRole } from "@egi/database";
import { TicketsService } from "./tickets.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("isolated Task intake creates a Ticket and leaves no Legacy Task", async (t) => {
  if (!testDatabaseUrl?.toLowerCase().includes("test")) {
    t.skip("TEST_DATABASE_URL for an isolated test database is required");
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const suffix = randomUUID();
  let userId: string | null = null;
  let projectId: string | null = null;
  let websiteId: string | null = null;
  t.after(async () => {
    if (projectId) {
      await prisma.ticket.deleteMany({ where: { projectId } });
    }
    if (websiteId) {
      await prisma.website.delete({ where: { id: websiteId } });
    }
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  const user = await prisma.user.create({
    data: {
      name: `Task intake test ${suffix}`,
      email: `task-intake-${suffix}@example.test`,
      passwordHash: "not-used",
      role: UserRole.superadmin,
    },
  });
  userId = user.id;
  const project = await prisma.project.create({
    data: {
      name: `Task intake test project ${suffix}`,
      status: "active",
      createdById: user.id,
    },
  });
  projectId = project.id;
  const website = await prisma.website.create({
    data: {
      name: `Task intake test website ${suffix}`,
      domain: `${suffix}.example.test`,
      url: `https://${suffix}.example.test`,
      projectId: project.id,
    },
  });
  websiteId = website.id;

  const service = new TicketsService(prisma as never);
  const created = await service.createTaskIntake(
    {
      title: "Test Task intake",
      project_id: project.id,
      website_id: website.id,
      category: TicketCategory.website,
      description: "Test description",
      expectation: "Test expectation",
    },
    { id: user.id, email: user.email, role: UserRole.superadmin },
  );

  assert.equal(created.project_id, project.id);
  assert.equal(created.website_id, website.id);
  assert.equal(await prisma.ticket.count({ where: { id: created.id } }), 1);
  assert.equal(await prisma.task.count({ where: { websiteId: website.id } }), 0);
});
