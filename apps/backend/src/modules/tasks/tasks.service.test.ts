import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@egi/database";
import { TasksService } from "./tasks.service";
import type { AuthUser } from "../../common/current-user.decorator";

const developer: AuthUser = { id: "dev-1", email: "dev@example.test", role: UserRole.developer };
const otherDeveloper = { id: "dev-2", role: UserRole.developer, isActive: true };
const superadmin: AuthUser = { id: "admin-1", email: "admin@example.test", role: UserRole.superadmin };
const bosIt: AuthUser = { id: "bos-1", email: "bos@example.test", role: UserRole.bos_it };

function makeFakePrisma(website: { itPicId: string | null; backupItPicId: string | null }) {
  const createdTasks: Array<Record<string, unknown>> = [];

  const prisma = {
    website: {
      findUnique: async () => ({
        id: "web-1",
        itPicId: website.itPicId,
        backupItPicId: website.backupItPicId,
      }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === developer.id) return { id: developer.id, role: UserRole.developer, isActive: true };
        if (where.id === otherDeveloper.id) return otherDeveloper;
        return null;
      },
    },
    task: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdTasks.push(data);
        return {
          id: "task-1",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          ticket: null,
        };
      },
    },
  };

  return { prisma, createdTasks };
}

test("developer creates a to-do for a website they are IT PIC of, self-assigned", async () => {
  const { prisma, createdTasks } = makeFakePrisma({ itPicId: developer.id, backupItPicId: null });
  const service = new TasksService(prisma as never);

  const result = await service.create(
    { website_id: "web-1", instruction_notes: "Perlu update konten" },
    developer,
  );

  assert.equal(createdTasks.length, 1);
  assert.equal(result.assignee_id, developer.id);
  assert.equal(result.created_by_id, developer.id);
});

test("developer creates a to-do for a website they are backup IT PIC of", async () => {
  const { prisma, createdTasks } = makeFakePrisma({ itPicId: "someone-else", backupItPicId: developer.id });
  const service = new TasksService(prisma as never);

  await service.create({ website_id: "web-1", instruction_notes: "Cek server" }, developer);

  assert.equal(createdTasks.length, 1);
  assert.equal(createdTasks[0]?.assigneeId, developer.id);
});

test("developer cannot create a to-do for a website they are not PIC/backup of", async () => {
  const { prisma } = makeFakePrisma({ itPicId: "someone-else", backupItPicId: "someone-else-2" });
  const service = new TasksService(prisma as never);

  await assert.rejects(
    () => service.create({ website_id: "web-1", instruction_notes: "Cek server" }, developer),
    /IT PIC or backup/,
  );
});

test("superadmin delegates a task with an explicit assignee, keeping creator distinct", async () => {
  const { prisma, createdTasks } = makeFakePrisma({ itPicId: null, backupItPicId: null });
  const service = new TasksService(prisma as never);

  const result = await service.create(
    { website_id: "web-1", assignee_id: otherDeveloper.id, instruction_notes: "Tolong perbaiki" },
    superadmin,
  );

  assert.equal(createdTasks.length, 1);
  assert.equal(result.assignee_id, otherDeveloper.id);
  assert.equal(result.created_by_id, superadmin.id);
  assert.notEqual(result.assignee_id, result.created_by_id);
});

test("Bos IT delegates a task with an explicit developer assignee", async () => {
  const { prisma, createdTasks } = makeFakePrisma({ itPicId: null, backupItPicId: null });
  const service = new TasksService(prisma as never);

  const result = await service.create(
    { website_id: "web-1", assignee_id: otherDeveloper.id, instruction_notes: "Tolong perbaiki" },
    bosIt,
  );

  assert.equal(createdTasks.length, 1);
  assert.equal(result.assignee_id, otherDeveloper.id);
  assert.equal(result.created_by_id, bosIt.id);
});

test("superadmin must provide an assignee_id when delegating", async () => {
  const { prisma } = makeFakePrisma({ itPicId: null, backupItPicId: null });
  const service = new TasksService(prisma as never);

  await assert.rejects(
    () => service.create({ website_id: "web-1", instruction_notes: "Tolong perbaiki" }, superadmin),
    /assignee_id is required/,
  );
});

test("PIC Web lists only tasks on websites they own", async () => {
  const picWeb: AuthUser = { id: "pic-1", email: "pic@example.test", role: UserRole.pic_web };
  let capturedWhere: Record<string, unknown> | undefined;
  const prisma = {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    task: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return 0;
      },
      findMany: async () => [],
    },
  };
  const service = new TasksService(prisma as never);

  await service.list({ page: 1, limit: 20 }, { page: 1, limit: 20 }, picWeb);

  assert.deepEqual(capturedWhere?.website, { ownerId: picWeb.id });
});

