/**
 * Create one open incident for RBAC mutate tests.
 * Usage: npx tsx scripts/rbac-seed-incident.mts
 */
import {
  IncidentStatus,
  PrismaClient,
  Severity,
  TicketStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const site = await prisma.website.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  if (!site) throw new Error("No website");

  // Close any previous RBAC test incidents
  await prisma.incident.updateMany({
    where: {
      websiteId: site.id,
      title: { startsWith: "[RBAC-TEST]" },
      status: { in: [IncidentStatus.open, IncidentStatus.in_progress] },
    },
    data: { status: IncidentStatus.closed, resolvedAt: new Date() },
  });

  const incident = await prisma.incident.create({
    data: {
      websiteId: site.id,
      title: "[RBAC-TEST] Synthetic open incident",
      severity: Severity.medium,
      status: IncidentStatus.open,
      startedAt: new Date(),
    },
  });

  const ticket = await prisma.ticket.create({
    data: {
      incidentId: incident.id,
      title: "[RBAC-TEST] Synthetic ticket",
      priority: Severity.medium,
      status: TicketStatus.open,
    },
  });

  console.log(JSON.stringify({ incidentId: incident.id, ticketId: ticket.id, websiteId: site.id }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
