import assert from "node:assert/strict";
import test from "node:test";
import { NotificationChannel, TicketCategory } from "@egi/database";
import { TicketsService } from "./tickets.service";

const developer = { id: "dev-1", email: "dev@example.test" };
const bosItUsers = [{ email: "boss1@example.test" }, { email: "boss2@example.test" }];
const creator = { id: "creator-1", email: "creator@example.test", role: "superadmin" };

function makeFakePrisma(website: { itPicId: string | null; backupItPicId: string | null }) {
  const notifications: Array<Record<string, unknown>> = [];
  const tasks: Array<Record<string, unknown>> = [];

  const prisma = {
    website: {
      findUnique: async () => ({
        id: "web-1",
        name: "Situs A",
        ownerId: "owner-1",
        itPicId: website.itPicId,
        backupItPicId: website.backupItPicId,
      }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === developer.id ? developer : null,
      findMany: async () => bosItUsers,
    },
    ticket: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "ticket-1",
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
        assignee: null,
      }),
    },
    task: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        tasks.push(data);
        return data;
      },
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  return { prisma, notifications, tasks };
}

test("create() with an assignee emails the developer and CC's active Bos IT users", async () => {
  const { prisma, notifications, tasks } = makeFakePrisma({ itPicId: developer.id, backupItPicId: null });
  const service = new TicketsService(prisma as never);

  await service.create(
    { website_id: "web-1", category: TicketCategory.website, description: "Situs error", expectation: "Segera diperbaiki" },
    creator,
  );

  assert.equal(tasks.length, 1);
  assert.equal(notifications.length, 1);
  const notification = notifications[0];
  assert.ok(notification);
  assert.equal(notification.userId, developer.id);
  assert.equal(notification.channel, NotificationChannel.email);
  assert.deepEqual(notification.ccEmails, ["boss1@example.test", "boss2@example.test"]);
  assert.match(String(notification.message), /Situs error/);
});

test("create() without an assignee sends no notification", async () => {
  const { prisma, notifications, tasks } = makeFakePrisma({ itPicId: null, backupItPicId: null });
  const service = new TicketsService(prisma as never);

  await service.create(
    { website_id: "web-1", category: TicketCategory.website, description: "Situs error", expectation: "Segera diperbaiki" },
    creator,
  );

  assert.equal(tasks.length, 0);
  assert.equal(notifications.length, 0);
});
