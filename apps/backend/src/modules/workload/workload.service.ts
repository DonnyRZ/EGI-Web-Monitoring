import { Injectable } from "@nestjs/common";
import { TaskStatus, TicketStatus, UserRole } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * A ticket that gets a website + assignee at creation time auto-spawns a
 * linked Task in the same transaction (see TicketsService.create), and the
 * developer works that Task, not the ticket directly. Counting both would
 * double-count the same unit of work. Only tickets with NO linked task
 * (e.g. help_desk/procurement categories without a website) are genuinely
 * standalone and counted here as "orphan tickets".
 */
export interface DeveloperWorkloadRow {
  developer_id: string;
  developer_name: string;
  pending: number;
  pending_orphan_tickets: number;
  in_progress: number;
  in_progress_orphan_tickets: number;
  overdue: number;
  overdue_orphan_tickets: number;
  total_active: number;
}

@Injectable()
export class WorkloadService {
  constructor(private readonly prisma: PrismaService) {}

  async developers(): Promise<DeveloperWorkloadRow[]> {
    const now = Date.now();

    const [developers, orphanTickets, tasks] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: UserRole.developer, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.ticket.findMany({
        where: {
          assignedTo: { not: null },
          status: { in: [TicketStatus.open, TicketStatus.in_progress] },
          task: null,
        },
        select: { assignedTo: true, status: true, slaDeadline: true },
      }),
      this.prisma.task.findMany({
        where: { status: { in: [TaskStatus.pending, TaskStatus.in_progress] } },
        select: { assigneeId: true, status: true, slaDeadline: true },
      }),
    ]);

    const rows = new Map<string, DeveloperWorkloadRow>();
    for (const dev of developers) {
      rows.set(dev.id, {
        developer_id: dev.id,
        developer_name: dev.name,
        pending: 0,
        pending_orphan_tickets: 0,
        in_progress: 0,
        in_progress_orphan_tickets: 0,
        overdue: 0,
        overdue_orphan_tickets: 0,
        total_active: 0,
      });
    }

    for (const ticket of orphanTickets) {
      if (!ticket.assignedTo) continue;
      const row = rows.get(ticket.assignedTo);
      if (!row) continue;
      if (ticket.status === TicketStatus.open) {
        row.pending += 1;
        row.pending_orphan_tickets += 1;
      } else if (ticket.status === TicketStatus.in_progress) {
        row.in_progress += 1;
        row.in_progress_orphan_tickets += 1;
      }
      if (ticket.slaDeadline && ticket.slaDeadline.getTime() < now) {
        row.overdue += 1;
        row.overdue_orphan_tickets += 1;
      }
      row.total_active += 1;
    }

    for (const task of tasks) {
      const row = rows.get(task.assigneeId);
      if (!row) continue;
      if (task.status === TaskStatus.pending) row.pending += 1;
      else if (task.status === TaskStatus.in_progress) row.in_progress += 1;
      if (task.slaDeadline && task.slaDeadline.getTime() < now) row.overdue += 1;
      row.total_active += 1;
    }

    return Array.from(rows.values()).sort((a, b) => {
      const overdueDiff = b.overdue - a.overdue;
      if (overdueDiff !== 0) return overdueDiff;
      return b.total_active - a.total_active;
    });
  }
}
