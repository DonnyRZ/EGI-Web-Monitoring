/**
 * One-time backfill: create the missing developer Task for every active ticket
 * (open/in_progress, has a website and an assignee) that predates the
 * ticket-to-task pipeline. Safe to re-run — skips tickets that already have a task.
 * Run: node --import tsx scripts/backfill-ticket-tasks.mts
 */
import { PrismaClient, TaskStatus, TicketStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: [TicketStatus.open, TicketStatus.in_progress] },
      websiteId: { not: null },
      assignedTo: { not: null },
      task: null,
    },
    select: { id: true, title: true, websiteId: true, assignedTo: true, slaDeadline: true, status: true },
  });

  let created = 0;
  for (const ticket of tickets) {
    if (!ticket.websiteId || !ticket.assignedTo) continue;
    await prisma.task.create({
      data: {
        websiteId: ticket.websiteId,
        assigneeId: ticket.assignedTo,
        ticketId: ticket.id,
        instructionNotes: `Tiket: ${ticket.title}`,
        slaDeadline: ticket.slaDeadline,
        status: ticket.status === TicketStatus.in_progress ? TaskStatus.in_progress : TaskStatus.pending,
      },
    });
    created += 1;
  }

  console.log(JSON.stringify({ ok: true, ticketsScanned: tickets.length, tasksCreated: created }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
