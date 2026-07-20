/**
 * Removes only known artifacts created by the historical deep API test.
 * Defaults to dry-run. Execution requires ALLOW_TEST_DATA_REMEDIATION=yes.
 */
import { PrismaClient } from "@egi/database";

const prisma = new PrismaClient();
const execute = process.env.ALLOW_TEST_DATA_REMEDIATION === "yes";

const testWebsiteWhere = {
  OR: [
    { name: { startsWith: "Empty Mon " } },
    { name: "Bad URL", domain: "x" },
    { name: { startsWith: "Deep Test Site" } },
    { domain: "empty-mon.example" },
  ],
};

async function buildPlan(client = prisma) {
  const [websites, testUsers, futureResults, titledIncidents] = await Promise.all([
    client.website.findMany({ where: testWebsiteWhere, select: { id: true, name: true } }),
    client.user.findMany({
      where: { email: { startsWith: "deeptest." } },
      select: { id: true, email: true },
    }),
    client.monitoringResult.findMany({
      where: { scheduledAt: { gte: new Date("2099-01-01T00:00:00.000Z") } },
      select: { id: true },
    }),
    client.incident.findMany({
      where: {
        OR: [
          { title: { startsWith: "Deep " } },
          { title: "Still open" },
        ],
      },
      select: { id: true },
    }),
  ]);

  const websiteIds = websites.map((website) => website.id);
  const websiteIncidents = websiteIds.length
    ? await client.incident.findMany({ where: { websiteId: { in: websiteIds } }, select: { id: true } })
    : [];
  const incidentIds = [...new Set([...titledIncidents, ...websiteIncidents].map((incident) => incident.id))];
  const userIds = testUsers.map((user) => user.id);

  const [tickets, notifications] = await Promise.all([
    incidentIds.length
      ? client.ticket.findMany({ where: { incidentId: { in: incidentIds } }, select: { id: true } })
      : [],
    client.notification.findMany({
      where: {
        OR: [
          { title: { startsWith: "DeepNotif" } },
          ...(incidentIds.length ? [{ incidentId: { in: incidentIds } }] : []),
          ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        ],
      },
      select: { id: true },
    }),
  ]);

  return {
    websiteIds,
    websiteNames: websites.map((website) => website.name),
    userIds,
    userEmails: testUsers.map((user) => user.email),
    futureResultIds: futureResults.map((result) => result.id),
    incidentIds,
    ticketIds: tickets.map((ticket) => ticket.id),
    notificationIds: notifications.map((notification) => notification.id),
  };
}

async function applyPlan(plan) {
  await prisma.$transaction(async (tx) => {
    if (plan.notificationIds.length) {
      await tx.notification.deleteMany({ where: { id: { in: plan.notificationIds } } });
    }
    if (plan.ticketIds.length) {
      await tx.ticket.deleteMany({ where: { id: { in: plan.ticketIds } } });
    }
    if (plan.incidentIds.length) {
      await tx.incident.deleteMany({ where: { id: { in: plan.incidentIds } } });
    }
    if (plan.futureResultIds.length) {
      await tx.monitoringResult.deleteMany({ where: { id: { in: plan.futureResultIds } } });
    }
    if (plan.websiteIds.length) {
      await tx.website.deleteMany({ where: { id: { in: plan.websiteIds } } });
    }
    if (plan.userIds.length) {
      await tx.userSession.deleteMany({ where: { userId: { in: plan.userIds } } });
      await tx.user.deleteMany({ where: { id: { in: plan.userIds } } });
    }
  });
}

async function main() {
  const plan = await buildPlan();
  const summary = {
    websites: plan.websiteNames,
    users: plan.userEmails,
    future_monitoring_results: plan.futureResultIds.length,
    incidents: plan.incidentIds.length,
    tickets: plan.ticketIds.length,
    notifications: plan.notificationIds.length,
  };
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", ...summary }, null, 2));

  if (!execute) {
    console.log("Dry-run only. Set ALLOW_TEST_DATA_REMEDIATION=yes to execute this exact remediation.");
    return;
  }

  await applyPlan(plan);
  console.log("Known deep-test artifacts removed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

export { buildPlan };
