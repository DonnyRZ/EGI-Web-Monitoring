import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
  Severity,
  TaskStatus,
  TicketCategory,
  TicketStatus,
  UserRole,
} from "@egi/database";
import { canCreateTaskIntake, canManagePlatform } from "@egi/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toTicketDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { CreateTicketDto, TicketsQueryDto, UpdateTicketDto } from "./tickets.dto";
import { CreateTaskIntakeDto } from "./task-intake.dto";
import { canOperateScopedResources, projectVisibilityWhere } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";
import { createSignedObjectUrl, uploadObject } from "../../common/s3";

const TICKET_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, email: true } },
  storyLinks: { select: { userStoryId: true } },
} as const;

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOperational(user: AuthUser) {
    if (!canOperateScopedResources(user)) {
      throw new ForbiddenException("Tickets require an operational role");
    }
  }

  private async assertWebsiteAccess(websiteId: string, user: AuthUser) {
    const website = await this.prisma.website.findUnique({
      where: { id: websiteId },
      include: { project: { select: { id: true, picDeveloperId: true } } },
    });
    if (!website) throw new NotFoundException("Website not found");
    if (website.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: website.projectId, ...projectVisibilityWhere(user) },
        select: { id: true },
      });
      if (!project) throw new ForbiddenException("You can only use tickets inside your assigned Projects");
    } else if (user.role === "pic_web" && website.ownerId !== user.id) {
      throw new ForbiddenException("You can only use tickets for your assigned websites");
    }
    return website;
  }

  private ticketReadScope(user: AuthUser): Prisma.TicketWhereInput {
    if (user.role === "pic_web") {
      return {
        OR: [
          { project: { members: { some: { userId: user.id, memberType: "pic_web" } } } },
          { projectId: null, website: { ownerId: user.id } },
          { projectId: null, createdBy: user.id },
        ],
      };
    }
    if (user.role === "developer") {
      return {
        OR: [
          { assignedTo: user.id },
          { project: { picDeveloperId: user.id } },
          {
            userStory: {
              OR: [
                { primaryDeveloperId: user.id },
                { collaborators: { some: { userId: user.id } } },
              ],
            },
          },
          {
            storyLinks: {
              some: {
                userStory: {
                  OR: [
                    { primaryDeveloperId: user.id },
                    { collaborators: { some: { userId: user.id } } },
                  ],
                },
              },
            },
          },
        ],
      };
    }
    return {};
  }

  async list(pagination: PaginationQueryDto, filters: TicketsQueryDto, user: AuthUser) {
    this.assertOperational(user);

    const where: Prisma.TicketWhereInput = {};
    if (filters.incident_id) where.incidentId = filters.incident_id;
    if (filters.website_id) where.websiteId = filters.website_id;
    if (filters.project_id) where.projectId = filters.project_id;
    if (filters.assigned_to) where.assignedTo = filters.assigned_to;
    if (filters.status) where.status = filters.status;
    // Filters narrow a user's visibility; they must never broaden it. In
    // particular, a developer cannot bypass the assignee scope by adding an
    // incident_id or another developer's assigned_to query parameter.
    Object.assign(where, this.ticketReadScope(user));

    const [total, tickets] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: TICKET_INCLUDE,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      data: tickets.map(toTicketDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async uploadAttachment(file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, user: AuthUser) {
    this.assertOperational(user);
    if (!file || file.size > 10 * 1024 * 1024) {
      throw new BadRequestException("Attachment must be smaller than 10 MB");
    }
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `tickets/${user.id}/${randomUUID()}-${safeName}`;
    await uploadObject(key, file.buffer, file.mimetype || "application/octet-stream");
    return { attachment_url: key };
  }

  async getAttachmentSignedUrl(id: string, user: AuthUser) {
    const ticket = await this.getRecord(id, user);
    if (!ticket.attachmentUrl) {
      throw new NotFoundException("Attachment not available");
    }
    const signed = await createSignedObjectUrl(ticket.attachmentUrl);
    return { url: signed.url, expires_at: signed.expiresAt };
  }

  /**
   * Canonical business Task intake. The persistence model remains Ticket for
   * compatibility, but this contract cannot select a developer or create a
   * Legacy Task row.
   */
  async createTaskIntake(dto: CreateTaskIntakeDto, user: AuthUser) {
    if (!canCreateTaskIntake(user.role)) {
      throw new ForbiddenException("Task intake requires superadmin, bos_it, or pic_web role");
    }
    if (dto.category === TicketCategory.new_website) {
      throw new BadRequestException("Gunakan Pengajuan Project untuk meminta Project baru");
    }
    if (!dto.title.trim()) {
      throw new BadRequestException("title is required");
    }

    if (dto.category === TicketCategory.website && !dto.website_id) {
      throw new BadRequestException("website_id is required for a website Task");
    }

    if (dto.website_id) {
      const website = await this.assertWebsiteAccess(dto.website_id, user);
      if (!website.projectId) {
        throw new BadRequestException("Website must belong to a Project before creating a Task");
      }
      if (dto.project_id && dto.project_id !== website.projectId) {
        throw new BadRequestException("project_id must match the Website Project");
      }
    }

    return this.create(
      {
        title: dto.title,
        project_id: dto.project_id,
        website_id: dto.website_id,
        category: dto.category,
        description: dto.description,
        expectation: dto.expectation,
        requested_website_name: dto.requested_website_name,
        requested_domain: dto.requested_domain,
        requested_project_name: dto.requested_project_name,
        attachment_url: dto.attachment_url,
        priority: dto.priority,
      },
      user,
    );
  }

  async create(dto: CreateTicketDto, user: AuthUser) {
    this.assertOperational(user);
    if (dto.category === TicketCategory.new_website) {
      throw new BadRequestException("Gunakan Pengajuan Project untuk meminta Project baru");
    }
    if (
      !dto.incident_id &&
      !dto.website_id &&
      dto.category !== TicketCategory.help_desk &&
      dto.category !== TicketCategory.procurement
    ) {
      throw new BadRequestException("A ticket without a Website must use help_desk or procurement category");
    }
    if (!dto.incident_id && (!dto.category || !dto.description?.trim() || !dto.expectation?.trim())) {
      throw new BadRequestException("category, description, and expectation are required for a new ticket");
    }

    let websiteId = dto.website_id;

    if (dto.incident_id) {
      const incident = await this.prisma.incident.findUnique({
        where: { id: dto.incident_id },
      });
      if (!incident) throw new NotFoundException("Incident not found");
      if (websiteId && websiteId !== incident.websiteId) {
        throw new BadRequestException("website_id must match the incident website");
      }
      // Incident-only tickets inherit the incident website. This both keeps
      // the data consistent and lets PIC Web ownership checks apply to them.
      websiteId ??= incident.websiteId;
    }

    const website = websiteId ? await this.assertWebsiteAccess(websiteId, user) : null;
    const projectId = dto.project_id ?? website?.projectId ?? null;
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, ...projectVisibilityWhere(user) },
        select: { id: true, picDeveloperId: true },
      });
      if (!project) throw new ForbiddenException("You can only create tickets inside your assigned Projects");
      if (user.role === UserRole.developer && project.picDeveloperId !== user.id) {
        throw new ForbiddenException("Only the Project PIC Developer can create technical Project tickets");
      }
      if (website?.projectId && website.projectId !== projectId) {
        throw new BadRequestException("project_id must match the Website Project");
      }
    }

    const assignedTo =
      dto.assigned_to ??
      (website
        ? website.projectId
          ? website.project?.picDeveloperId ?? null
          : website.itPicId ?? null
        : null);

    const title = dto.title?.trim() || this.titleForCategory(dto.category);

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          incidentId: dto.incident_id,
          websiteId,
          projectId,
          createdBy: user.id,
          title,
          category: dto.category,
          description: dto.description?.trim(),
          expectation: dto.expectation?.trim(),
          attachmentUrl: dto.attachment_url,
          assignedTo,
          priority: dto.priority ?? Severity.medium,
          status: TicketStatus.open,
        },
        include: TICKET_INCLUDE,
      });

      // Preserve the legacy ticket/task pipeline only for websites that have
      // not been linked to a Project yet. Project-based tickets use User
      // Stories as their canonical work unit and never create a new Task.
      if (created.websiteId && created.assignedTo && !created.projectId) {
        await tx.task.create({
          data: {
            websiteId: created.websiteId,
            assigneeId: created.assignedTo,
            ticketId: created.id,
            instructionNotes: `Tiket: ${created.title}`,
            slaDeadline: created.slaDeadline,
            status: TaskStatus.pending,
          },
        });
      }

      if (created.assignedTo) {
        await this.notifyTicketAssignment(tx, created, website, user);
      }

      return created;
    });

    return toTicketDto(ticket);
  }

  /** Email the assigned developer that a new ticket landed on their plate, CC'ing every active Bos IT. */
  private async notifyTicketAssignment(
    tx: Prisma.TransactionClient,
    ticket: {
      id: string;
      title: string;
      category: TicketCategory | null;
      description: string | null;
      expectation: string | null;
      assignedTo: string | null;
      incidentId: string | null;
    },
    website: { name: string } | null,
    creator: AuthUser,
  ) {
    if (!ticket.assignedTo) return;

    const [assignee, bosIt] = await Promise.all([
      tx.user.findUnique({ where: { id: ticket.assignedTo }, select: { email: true } }),
      tx.user.findMany({
        where: { role: UserRole.bos_it, isActive: true },
        select: { email: true },
      }),
    ]);
    if (!assignee?.email) return;

    const ccEmails = bosIt
      .map((u) => u.email)
      .filter((email) => email && email !== assignee.email);

    const lines = [
      "Tiket baru ditugaskan kepada Anda.",
      website ? `Website: ${website.name}` : null,
      ticket.category ? `Kategori: ${this.titleForCategory(ticket.category)}` : null,
      ticket.description ? `Masalah: ${ticket.description}` : null,
      ticket.expectation ? `Ekspektasi: ${ticket.expectation}` : null,
      `Dibuat oleh: ${creator.email}`,
    ].filter((line): line is string => Boolean(line));

    const appUrl = process.env.PUBLIC_APP_URL?.trim();
    if (appUrl) {
      lines.push(`Lihat tiket: ${appUrl.replace(/\/+$/, "")}/tasks`);
    }

    await tx.notification.create({
      data: {
        userId: ticket.assignedTo,
        incidentId: ticket.incidentId ?? undefined,
        channel: NotificationChannel.email,
        title: `Tiket baru: ${ticket.title}`,
        message: lines.join("\n"),
        status: NotificationStatus.pending,
        ccEmails,
      },
    });
  }

  private titleForCategory(category?: TicketCategory) {
    switch (category) {
      case TicketCategory.website: return "Permintaan Website";
      case TicketCategory.new_website: return "Permintaan Website Baru";
      case TicketCategory.help_desk: return "Permintaan Help Desk";
      case TicketCategory.procurement: return "Permintaan Procurement";
      default: return "Tiket Baru";
    }
  }

  private async getRecord(id: string, user: AuthUser) {
    this.assertOperational(user);
    const ticket = typeof this.prisma.ticket.findFirst === "function"
      ? await this.prisma.ticket.findFirst({
          where: { id, ...this.ticketReadScope(user) },
          include: TICKET_INCLUDE,
        })
      : await this.prisma.ticket.findUnique({ where: { id }, include: TICKET_INCLUDE });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async get(id: string, user: AuthUser) {
    return toTicketDto(await this.getRecord(id, user));
  }

  async update(id: string, dto: UpdateTicketDto, user: AuthUser) {
    this.assertOperational(user);
    const existing = await this.getRecord(id, user);
    if (existing.status === TicketStatus.closed) {
      throw new BadRequestException("Closed tickets cannot be updated");
    }
    if (user.role === "pic_web") {
      throw new ForbiddenException("PIC Web cannot update tickets");
    }
    if (user.role === "developer") {
      const storyIds = [existing.userStoryId, ...(existing.storyLinks?.map((link) => link.userStoryId) ?? [])].filter(
        (storyId): storyId is string => Boolean(storyId),
      );
      const assignedStory = storyIds.length > 0
        ? await this.prisma.userStory.findFirst({
            where: {
              id: { in: storyIds },
              OR: [
                { primaryDeveloperId: user.id },
                { collaborators: { some: { userId: user.id } } },
              ],
            },
            select: { id: true },
          })
        : null;
      if (existing.assignedTo !== user.id && !assignedStory) {
        throw new ForbiddenException("You can only update tickets assigned to you");
      }
      if (dto.sla_deadline !== undefined || dto.assigned_to !== undefined || dto.title || dto.priority) {
        throw new ForbiddenException("Developers can only update ticket status");
      }
      if (dto.status && dto.status !== TicketStatus.in_progress && dto.status !== TicketStatus.resolved) {
        throw new ForbiddenException("Developers can only start or complete tickets");
      }
    }
    if (dto.status === TicketStatus.open && existing.status !== TicketStatus.open) {
      throw new BadRequestException("Resolved tickets cannot be reopened");
    }

    const canEditSla = canManagePlatform(user.role) || user.role === "bos_it";
    const nextAssigneeId = canEditSla ? dto.assigned_to : undefined;
    const assigneeChanged =
      nextAssigneeId !== undefined && nextAssigneeId !== existing.assignedTo;

    if (assigneeChanged && nextAssigneeId) {
      await this.assertActiveDeveloper(nextAssigneeId);
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          title: dto.title,
          assignedTo: canEditSla ? dto.assigned_to : undefined,
          priority: dto.priority,
          status: dto.status,
          slaDeadline:
            canEditSla && dto.sla_deadline !== undefined
              ? dto.sla_deadline
                ? new Date(dto.sla_deadline)
                : null
              : undefined,
          resolvedAt:
            (dto.status === TicketStatus.resolved || dto.status === TicketStatus.closed) && !existing.resolvedAt
              ? new Date()
              : undefined,
        },
        include: TICKET_INCLUDE,
      });

      if (
        dto.status !== undefined ||
        (canEditSla && (dto.assigned_to !== undefined || dto.sla_deadline !== undefined))
      ) {
        await this.syncTaskFromTicket(tx, updated);
      }

      if (assigneeChanged) {
        await this.notifyTicketReassignment(tx, updated, existing.assignedTo, user);
      }

      return updated;
    });

    return toTicketDto(ticket);
  }

  private async assertActiveDeveloper(userId: string) {
    const assignee = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!assignee) throw new NotFoundException("Assignee not found");
    if (!assignee.isActive) throw new BadRequestException("Assignee is inactive");
    if (assignee.role !== UserRole.developer) {
      throw new BadRequestException("Assignee must have the developer role");
    }
  }

  private async notifyTicketReassignment(
    tx: Prisma.TransactionClient,
    ticket: {
      id: string;
      title: string;
      websiteId: string | null;
      incidentId: string | null;
      assignedTo: string | null;
    },
    previousAssigneeId: string | null,
    actor: AuthUser,
  ) {
    const website = ticket.websiteId
      ? await tx.website.findUnique({
          where: { id: ticket.websiteId },
          select: { name: true },
        })
      : null;
    const now = new Date();
    const siteLine = website ? `Website: ${website.name}` : null;

    if (previousAssigneeId) {
      await tx.notification.create({
        data: {
          userId: previousAssigneeId,
          incidentId: ticket.incidentId ?? undefined,
          channel: NotificationChannel.dashboard,
          title: `Tiket dialihkan: ${ticket.title}`,
          message: [
            "Tiket/task ini dialihkan ke developer lain.",
            siteLine,
            `Dialihkan oleh: ${actor.email}`,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
          status: NotificationStatus.sent,
          sentAt: now,
        },
      });
    }

    if (ticket.assignedTo) {
      await tx.notification.create({
        data: {
          userId: ticket.assignedTo,
          incidentId: ticket.incidentId ?? undefined,
          channel: NotificationChannel.dashboard,
          title: `Tiket ditugaskan: ${ticket.title}`,
          message: [
            "Tiket/task ini ditugaskan kepada Anda.",
            siteLine,
            `Ditugaskan oleh: ${actor.email}`,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
          status: NotificationStatus.sent,
          sentAt: now,
        },
      });
    }
  }

  private taskStatusFromTicket(status: TicketStatus): TaskStatus {
    if (status === TicketStatus.in_progress) return TaskStatus.in_progress;
    if (status === TicketStatus.resolved || status === TicketStatus.closed) return TaskStatus.done;
    return TaskStatus.pending;
  }

  /** Keep linked task status, assignee, and deadline aligned with ticket edits. */
  private async syncTaskFromTicket(
    tx: Prisma.TransactionClient,
    ticket: {
      id: string;
      title: string;
      websiteId: string | null;
      assignedTo: string | null;
      slaDeadline: Date | null;
      status: TicketStatus;
    },
  ) {
    const existingTask = await tx.task.findUnique({ where: { ticketId: ticket.id } });
    if (existingTask) {
      await tx.task.update({
        where: { id: existingTask.id },
        data: {
          assigneeId: ticket.assignedTo ?? undefined,
          slaDeadline: ticket.slaDeadline,
          status: this.taskStatusFromTicket(ticket.status),
        },
      });
      return;
    }

    // New Project-based tickets never create a Task. Existing linked Tasks are
    // still synchronized above so the legacy read/update flow remains safe.
  }
}
