import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { NotificationChannel, NotificationStatus, PrismaClient } from "@egi/database";
import { reconcilePendingNotifications } from "./reconcile";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("requeues only pending email and Telegram notifications", async (t) => {
  if (!testDatabaseUrl?.includes("test")) {
    t.skip("TEST_DATABASE_URL for an isolated test database is required");
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const user = await prisma.user.create({
    data: {
      name: "Notification test",
      email: `notification-test-${randomUUID()}@example.test`,
      passwordHash: "not-used",
      role: "it_ops",
    },
  });
  const created = await prisma.notification.createMany({
    data: [
      { userId: user.id, channel: NotificationChannel.email, title: "Pending email", message: "x", status: NotificationStatus.pending },
      { userId: user.id, channel: NotificationChannel.telegram, title: "Pending Telegram", message: "x", status: NotificationStatus.pending },
      { userId: user.id, channel: NotificationChannel.dashboard, title: "Dashboard", message: "x", status: NotificationStatus.pending },
      { userId: user.id, channel: NotificationChannel.email, title: "Failed", message: "x", status: NotificationStatus.failed },
    ],
  });
  assert.equal(created.count, 4);
  const queued: string[] = [];

  t.after(async () => {
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  const count = await reconcilePendingNotifications(prisma, async (id) => {
    queued.push(id);
  });
  assert.equal(count, 2);
  assert.equal(queued.length, 2);
});
