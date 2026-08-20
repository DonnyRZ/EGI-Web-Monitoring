import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TaskStatus, TicketStatus, UserRole } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toTaskDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { canManagePlatform } from "@egi/shared-types";
import type { AuthUser } from "../../common/current-user.decorator";
import { TasksQueryDto, UpdateTaskStatusDto } from "./tasks.dto";

const DEVELOPER_ALLOWED_STATUSES: TaskStatus[] = [
  TaskStatus.in_progress,
  TaskStatus.done,
];

const TASK_INCLUDE = {
  ticket: { select: { id: true, description: true, expectation: true, attachmentUrl: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationQueryDto, filters: TasksQueryDto, user: AuthUser) {
    const where: Prisma.TaskWhereInput = {};

    if (canManagePlatform(user.role) || user.role === UserRole.bos_it) {
      if (filters.assignee_id) where.assigneeId = filters.assignee_id;
    } else if (user.role === UserRole.developer) {
      where.assigneeId = user.id;
    } else if (user.role === UserRole.pic_web) {
      // Legacy Tasks retain their historical Website-owner scope. New
      // Project-based work is surfaced through User Stories instead.
      where.website = { ownerId: user.id };
      if (filters.assignee_id) where.assigneeId = filters.assignee_id;
    } else {
      throw new ForbiddenException("Tasks require superadmin, bos_it, developer, or pic_web role");
    }

    if (filters.website_id) where.websiteId = filters.website_id;
    if (filters.status) where.status = filters.status;

    const [total, tasks] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: [{ slaDeadline: "asc" }, { createdAt: "desc" }],
      }),
    ]);

    return {
      data: tasks.map(toTaskDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, user: AuthUser) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Task not found");

    if (canManagePlatform(user.role)) {
      // Superadmin may set any TaskStatus on any task.
    } else if (user.role === UserRole.developer) {
      if (existing.assigneeId !== user.id) {
        throw new ForbiddenException("You can only update tasks assigned to you");
      }
      if (!DEVELOPER_ALLOWED_STATUSES.includes(dto.status)) {
        throw new BadRequestException(
          "Developers may only set status to in_progress or done",
        );
      }
    } else {
      throw new ForbiddenException("Tasks require superadmin or developer role");
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: { status: dto.status },
        include: TASK_INCLUDE,
      });

      if (updated.ticketId) {
        await this.syncTicketFromTask(tx, updated);
      }

      return updated;
    });

    return toTaskDto(task);
  }

  /** Mirror the task's progress onto its originating ticket so Bos IT sees real status without a second update. */
  private async syncTicketFromTask(
    tx: Prisma.TransactionClient,
    task: { ticketId: string | null; status: TaskStatus },
  ) {
    if (!task.ticketId) return;
    const ticket = await tx.ticket.findUnique({ where: { id: task.ticketId } });
    if (!ticket || ticket.status === TicketStatus.closed) return;

    if (task.status === TaskStatus.in_progress && ticket.status === TicketStatus.open) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.in_progress },
      });
    } else if (task.status === TaskStatus.done && ticket.status !== TicketStatus.resolved) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.resolved, resolvedAt: ticket.resolvedAt ?? new Date() },
      });
    }
  }
}
