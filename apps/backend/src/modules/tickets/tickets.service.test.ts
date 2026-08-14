import assert from "node:assert/strict";
import test from "node:test";
import { NotificationChannel, TicketCategory, TicketStatus, UserRole } from "@egi/database";
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

const previousDev = {
  id: "dev-1",
  email: "donny@example.test",
  role: UserRole.developer,
  isActive: true,
};
const nextDev = {
  id: "dev-2",
  email: "dewa@example.test",
  role: UserRole.developer,
  isActive: true,
};
const bosIt: { id: string; email: string; role: string } = {
  id: "bos-1",
  email: "bos@example.test",
  role: "bos_it",
};

function makeUpdatePrisma(existing: {
  assignedTo: string | null;
  status?: TicketStatus;
}) {
  const notifications: Array<Record<string, unknown>> = [];
  const websiteUpdates: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const ticket = {
    id: "ticket-1",
    title: "Permintaan Website",
    websiteId: "web-1",
    incidentId: null,
    createdBy: "pic-1",
    category: TicketCategory.website,
    description: "Situs error",
    expectation: "Diperbaiki",
    attachmentUrl: null,
    assignedTo: existing.assignedTo,
    priority: "medium",
    status: existing.status ?? TicketStatus.open,
    slaDeadline: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    assignee: existing.assignedTo === previousDev.id ? { id: previousDev.id, name: "Donny" } : null,
  };
  const users: Record<string, typeof previousDev> = {
    [previousDev.id]: previousDev,
    [nextDev.id]: nextDev,
  };

  const prisma = {
    ticket: {
      findUnique: async () => ({ ...ticket }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            (ticket as Record<string, unknown>)[key] = value;
          }
        }
        return {
          ...ticket,
          assignee:
            ticket.assignedTo === nextDev.id
              ? { id: nextDev.id, name: "Dewa" }
              : ticket.assignedTo === previousDev.id
                ? { id: previousDev.id, name: "Donny" }
                : null,
        };
      },
    },
    task: {
      findUnique: async () => ({ id: "task-1", ticketId: ticket.id, assigneeId: existing.assignedTo }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        taskUpdates.push(data);
        return data;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users[where.id] ?? null,
    },
    website: {
      findUnique: async () => ({ id: "web-1", name: "Hadith Hotel", itPicId: previousDev.id }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        websiteUpdates.push(data);
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

  return { prisma, notifications, websiteUpdates, taskUpdates };
}

test("reassigning a ticket notifies both developers and does not change website PIC", async () => {
  const { prisma, notifications, websiteUpdates, taskUpdates } = makeUpdatePrisma({
    assignedTo: previousDev.id,
  });
  const service = new TicketsService(prisma as never);

  const updated = await service.update("ticket-1", { assigned_to: nextDev.id }, bosIt);

  assert.equal(updated.assigned_to, nextDev.id);
  assert.equal(taskUpdates.length, 1);
  assert.equal(taskUpdates[0]?.assigneeId, nextDev.id);
  assert.equal(websiteUpdates.length, 0);
  assert.equal(notifications.length, 2);
  assert.ok(notifications.every((n) => n.channel === NotificationChannel.dashboard));
  assert.equal(notifications[0]?.userId, previousDev.id);
  assert.equal(notifications[1]?.userId, nextDev.id);
  assert.match(String(notifications[0]?.title), /dialihkan/i);
  assert.match(String(notifications[1]?.title), /ditugaskan/i);
});

test("updating assigned_to to the same developer creates no reassignment notifications", async () => {
  const { prisma, notifications } = makeUpdatePrisma({ assignedTo: previousDev.id });
  const service = new TicketsService(prisma as never);

  await service.update("ticket-1", { assigned_to: previousDev.id }, bosIt);

  assert.equal(notifications.length, 0);
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
