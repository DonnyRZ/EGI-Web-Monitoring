import assert from "node:assert/strict";
import test from "node:test";
import { TicketCategory, UserRole } from "@egi/database";
import { TicketsService } from "./tickets.service";

function makePrisma(websiteProjectId: string | null = "project-1") {
  const ticketCreates: Array<Record<string, unknown>> = [];
  const legacyTaskCreates: Array<Record<string, unknown>> = [];
  const project = { id: "project-1", picDeveloperId: null };
  const website = {
    id: "web-1",
    name: "Test Website",
    ownerId: "pic-1",
    projectId: websiteProjectId,
    itPicId: null,
    backupItPicId: null,
    project: websiteProjectId ? project : null,
  };
  const prisma = {
    website: {
      findUnique: async () => website,
    },
    project: {
      findFirst: async () => (websiteProjectId ? project : null),
    },
    ticket: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ticketCreates.push(data);
        return {
          id: "ticket-1",
          incidentId: null,
          projectId: data.projectId ?? null,
          websiteId: data.websiteId ?? null,
          userStoryId: null,
          createdBy: data.createdBy ?? null,
          title: data.title,
          category: data.category,
          description: data.description ?? null,
          expectation: data.expectation ?? null,
          attachmentUrl: data.attachmentUrl ?? null,
          assignedTo: data.assignedTo ?? null,
          priority: data.priority,
          status: data.status,
          slaDeadline: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          resolvedAt: null,
          assignee: null,
          storyLinks: [],
        };
      },
    },
    task: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        legacyTaskCreates.push(data);
        return data;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };
  return { prisma, ticketCreates, legacyTaskCreates };
}

const superadmin = { id: "admin-1", email: "admin@example.test", role: UserRole.superadmin };
const developer = { id: "dev-1", email: "dev@example.test", role: UserRole.developer };

test("Task intake creates an internal Ticket and never creates a Legacy Task", async () => {
  const { prisma, ticketCreates, legacyTaskCreates } = makePrisma();
  const service = new TicketsService(prisma as never);

  const result = await service.createTaskIntake(
    {
      title: "Perbaiki form kontak",
      project_id: "project-1",
      website_id: "web-1",
      category: TicketCategory.website,
      description: "Form mengembalikan error",
      expectation: "Form dapat dikirim",
      assigned_to: "developer-must-not-be-selected",
    } as never,
    superadmin,
  );

  assert.equal(ticketCreates.length, 1);
  assert.equal(legacyTaskCreates.length, 0);
  assert.equal(result.project_id, "project-1");
  assert.equal(result.website_id, "web-1");
  assert.equal(result.assigned_to, null);
  assert.equal(ticketCreates[0]?.assignedTo, null);
});

test("Task intake rejects developers even when called directly at the service boundary", async () => {
  const { prisma } = makePrisma();
  const service = new TicketsService(prisma as never);

  await assert.rejects(
    () => service.createTaskIntake(
      {
        title: "Tidak boleh",
        website_id: "web-1",
        category: TicketCategory.website,
        description: "Masalah",
        expectation: "Selesai",
      },
      developer,
    ),
    /Task intake requires/,
  );
});

test("website Task intake rejects a website that has not been assigned to a Project", async () => {
  const { prisma, ticketCreates, legacyTaskCreates } = makePrisma(null);
  const service = new TicketsService(prisma as never);

  await assert.rejects(
    () => service.createTaskIntake(
      {
        title: "Project wajib",
        website_id: "web-1",
        category: TicketCategory.website,
        description: "Masalah",
        expectation: "Selesai",
      },
      superadmin,
    ),
    /must belong to a Project/,
  );
  assert.equal(ticketCreates.length, 0);
  assert.equal(legacyTaskCreates.length, 0);
});
