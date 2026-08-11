import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TaskStatus, UserRole } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toTaskDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { canManagePlatform } from "@egi/shared-types";
import type { AuthUser } from "../../common/current-user.decorator";
import { CreateTaskDto, TasksQueryDto, UpdateTaskStatusDto } from "./tasks.dto";

const DEVELOPER_ALLOWED_STATUSES: TaskStatus[] = [
  TaskStatus.in_progress,
  TaskStatus.done,
];

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto) {
    const website = await this.prisma.website.findUnique({
      where: { id: dto.website_id },
      select: { id: true },
    });
    if (!website) throw new NotFoundException("Website not found");

    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assignee_id },
      select: { id: true, role: true, isActive: true },
    });
    if (!assignee) throw new NotFoundException("Assignee not found");
    if (!assignee.isActive) {
      throw new BadRequestException("Assignee is inactive");
    }
    if (assignee.role !== UserRole.developer) {
      throw new BadRequestException("Assignee must have the developer role");
    }

    const task = await this.prisma.task.create({
      data: {
        websiteId: dto.website_id,
        assigneeId: dto.assignee_id,
        instructionNotes: dto.instruction_notes,
        attachmentUrl: dto.attachment_url,
        slaDeadline: new Date(dto.sla_deadline),
        status: TaskStatus.pending,
      },
    });

    return toTaskDto(task);
  }

  async list(pagination: PaginationQueryDto, filters: TasksQueryDto, user: AuthUser) {
    const where: Prisma.TaskWhereInput = {};

    if (canManagePlatform(user.role) || user.role === UserRole.bos_it) {
      if (filters.assignee_id) where.assigneeId = filters.assignee_id;
    } else if (user.role === UserRole.developer) {
      where.assigneeId = user.id;
    } else {
      throw new ForbiddenException("Tasks require superadmin, bos_it, or developer role");
    }

    if (filters.website_id) where.websiteId = filters.website_id;
    if (filters.status) where.status = filters.status;

    const [total, tasks] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
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

    const task = await this.prisma.task.update({
      where: { id },
      data: { status: dto.status },
    });

    return toTaskDto(task);
  }
}
