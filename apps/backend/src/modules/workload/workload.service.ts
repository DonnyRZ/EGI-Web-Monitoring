import { Injectable } from "@nestjs/common";
import { TaskStatus, TicketStatus, UserRole } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";

export interface DeveloperWorkloadRow {
  developer_id: string;
  developer_name: string;
  tickets_open: number;
  tickets_in_progress: number;
  tickets_overdue: number;
  tasks_pending: number;
  tasks_in_progress: number;
  tasks_overdue: number;
  total_active: number;
}

@Injectable()
export class WorkloadService {
  constructor(private readonly prisma: PrismaService) {}

  async developers(): Promise<DeveloperWorkloadRow[]> {
    const now = Date.now();

    const [developers, tickets, tasks] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: UserRole.developer, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.ticket.findMany({
        where: {
          assignedTo: { not: null },
          status: { in: [TicketStatus.open, TicketStatus.in_progress] },
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
        tickets_open: 0,
        tickets_in_progress: 0,
        tickets_overdue: 0,
        tasks_pending: 0,
        tasks_in_progress: 0,
        tasks_overdue: 0,
        total_active: 0,
      });
    }

    for (const ticket of tickets) {
      if (!ticket.assignedTo) continue;
      const row = rows.get(ticket.assignedTo);
      if (!row) continue;
      if (ticket.status === TicketStatus.open) row.tickets_open += 1;
      else if (ticket.status === TicketStatus.in_progress) row.tickets_in_progress += 1;
      if (ticket.slaDeadline && ticket.slaDeadline.getTime() < now) row.tickets_overdue += 1;
      row.total_active += 1;
    }

    for (const task of tasks) {
      const row = rows.get(task.assigneeId);
      if (!row) continue;
      if (task.status === TaskStatus.pending) row.tasks_pending += 1;
      else if (task.status === TaskStatus.in_progress) row.tasks_in_progress += 1;
      if (task.slaDeadline && task.slaDeadline.getTime() < now) row.tasks_overdue += 1;
      row.total_active += 1;
    }

    return Array.from(rows.values()).sort((a, b) => {
      const overdueDiff =
        b.tickets_overdue + b.tasks_overdue - (a.tickets_overdue + a.tasks_overdue);
      if (overdueDiff !== 0) return overdueDiff;
      return b.total_active - a.total_active;
    });
  }
}
