import { Injectable } from "@nestjs/common";
import { TaskStatus, TicketStatus, UserRole } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../../common/current-user.decorator";
import { websiteVisibilityScope } from "../../common/resource-access";

/**
 * Legacy tickets may have a linked Task; counting both would double-count the
 * same unit of work. Project-based tickets use User Stories and therefore
 * remain visible as intake until a PIC Developer converts them. Only tickets
 * with NO linked Task are counted here as standalone/orphan tickets.
 *
 * PIC Web only sees developers who are IT PIC / backup PIC of websites they
 * own, and only work items on those websites.
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

  async developers(user: AuthUser): Promise<DeveloperWorkloadRow[]> {
    const now = Date.now();
    const scoped = await this.picWebScope(user);

    if (scoped && scoped.developerIds.length === 0) {
      return [];
    }

    const storyDelegate = (this.prisma as unknown as {
      userStory?: { findMany: (args: unknown) => Promise<unknown[]> };
    }).userStory;
    const [developers, orphanTickets, tasks, stories] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          role: UserRole.developer,
          isActive: true,
          ...(scoped ? { id: { in: scoped.developerIds } } : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.ticket.findMany({
        where: {
          assignedTo: { not: null },
          status: { in: [TicketStatus.open, TicketStatus.in_progress] },
          task: null,
          ...(scoped ? { websiteId: { in: scoped.websiteIds } } : {}),
        },
        select: { assignedTo: true, status: true, slaDeadline: true },
      }),
      this.prisma.task.findMany({
        where: {
          status: { in: [TaskStatus.pending, TaskStatus.in_progress] },
          ...(scoped ? { websiteId: { in: scoped.websiteIds } } : {}),
        },
        select: { assigneeId: true, status: true, slaDeadline: true },
      }),
      storyDelegate
        ? storyDelegate.findMany({
            where: {
              status: { not: "done" },
              ...(scoped?.projectIds.length ? { projectId: { in: scoped.projectIds } } : {}),
            },
            select: {
              status: true,
              dueDate: true,
              primaryDeveloperId: true,
              collaborators: { select: { userId: true } },
            },
          })
        : Promise.resolve([]),
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

    for (const story of stories as Array<{
      status: string;
      dueDate: Date | null;
      primaryDeveloperId: string | null;
      collaborators: Array<{ userId: string }>;
    }>) {
      const assignees = [story.primaryDeveloperId, ...story.collaborators.map((row) => row.userId)]
        .filter((id): id is string => Boolean(id));
      for (const assigneeId of new Set(assignees)) {
        const row = rows.get(assigneeId);
        if (!row) continue;
        if (story.status === "backlog" || story.status === "ready") row.pending += 1;
        else row.in_progress += 1;
        if (story.dueDate && story.dueDate.getTime() < now) row.overdue += 1;
        row.total_active += 1;
      }
    }

    return Array.from(rows.values()).sort((a, b) => {
      const overdueDiff = b.overdue - a.overdue;
      if (overdueDiff !== 0) return overdueDiff;
      return b.total_active - a.total_active;
    });
  }

  private async picWebScope(user: AuthUser) {
    if (user.role !== UserRole.pic_web) return null;
    const sites = await this.prisma.website.findMany({
      where: (this.prisma as unknown as { project?: unknown }).project
        ? websiteVisibilityScope(user)
        : { ownerId: user.id },
      select: {
        id: true,
        projectId: true,
        itPicId: true,
        backupItPicId: true,
        project: {
          select: {
            picDeveloperId: true,
            members: { where: { memberType: "developer" }, select: { userId: true } },
          },
        },
      },
    });
    const developerIds = [
      ...new Set(
        sites
          .flatMap((s) => [
            s.itPicId,
            s.backupItPicId,
            s.project?.picDeveloperId,
            ...(s.project?.members.map((member) => member.userId) ?? []),
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    return {
      websiteIds: sites.map((s) => s.id),
      projectIds: sites.map((s) => s.projectId).filter((id): id is string => Boolean(id)),
      developerIds,
    };
  }
}
