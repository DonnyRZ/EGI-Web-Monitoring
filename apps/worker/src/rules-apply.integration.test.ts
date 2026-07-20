import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  MonitoringStatus,
  PrismaClient,
} from "@egi/database";
import { persistCheckAndEvaluate } from "./rules-apply";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("parallel failure processing creates exactly one active incident and ticket", async (t) => {
  if (!testDatabaseUrl?.includes("test")) {
    t.skip("TEST_DATABASE_URL for an isolated test database is required");
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: testDatabaseUrl } },
  });
  const website = await prisma.website.create({
    data: {
      name: `Race test ${randomUUID()}`,
      domain: "race-test.example",
      url: "https://race-test.example",
      isActive: true,
    },
  });
  const notificationIds: string[] = [];

  t.after(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    await prisma.website.delete({ where: { id: website.id } });
    await prisma.$disconnect();
  });

  const firstFailureAt = new Date("2026-01-01T00:00:00.000Z");
  await prisma.monitoringResult.create({
    data: {
      websiteId: website.id,
      scheduledAt: firstFailureAt,
      checkedAt: firstFailureAt,
      status: MonitoringStatus.warning,
      errorMessage: "first failure",
    },
  });

  const input = (scheduledAt: Date) => ({
    prisma,
    websiteId: website.id,
    websiteName: website.name,
    scheduledAt,
    screenshotUrl: null,
    probe: {
      httpOk: false,
      httpStatus: null,
      responseTimeMs: null,
      browserOk: false,
      renderTimeMs: null,
      screenshotOk: false,
      errorMessage: "simulated website outage",
    },
    enqueueNotification: async (id: string) => {
      notificationIds.push(id);
    },
  });

  await Promise.all([
    persistCheckAndEvaluate(input(new Date("2026-01-01T00:01:00.000Z"))),
    persistCheckAndEvaluate(input(new Date("2026-01-01T00:02:00.000Z"))),
  ]);

  const [incidents, tickets] = await Promise.all([
    prisma.incident.count({
      where: { websiteId: website.id, status: { in: ["open", "in_progress"] } },
    }),
    prisma.ticket.count({ where: { incident: { websiteId: website.id } } }),
  ]);

  assert.equal(incidents, 1);
  assert.equal(tickets, 1);
});
