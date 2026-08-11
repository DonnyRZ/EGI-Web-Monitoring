import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, Severity, TaskStatus, TicketCategory, TicketStatus } from "@egi/database";
import { canManagePlatform } from "@egi/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toTicketDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { CreateTicketDto, TicketsQueryDto, UpdateTicketDto } from "./tickets.dto";
import { canOperateScopedResources } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";
import { createScreenshotSignedUrl, uploadObject } from "../../common/s3";

const TICKET_INCLUDE = {
  assignee: { select: { id: true, name: true } },
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
    const website = await this.prisma.website.findUnique({ where: { id: websiteId } });
    if (!website) throw new NotFoundException("Website not found");
    if (user.role === "pic_web" && website.ownerId !== user.id) {
      throw new ForbiddenException("You can only use tickets for your assigned websites");
    }
    return website;
  }

  async list(pagination: PaginationQueryDto, filters: TicketsQueryDto, user: AuthUser) {
    this.assertOperational(user);

    const where: Prisma.TicketWhereInput = {};
    if (filters.incident_id) where.incidentId = filters.incident_id;
    if (filters.website_id) where.websiteId = filters.website_id;
    if (filters.assigned_to) where.assignedTo = filters.assigned_to;
    if (filters.status) where.status = filters.status;
    if (user.role === "pic_web") {
      where.website = { ownerId: user.id };
    } else if (user.role === "developer" && !filters.incident_id && !filters.assigned_to) {
      where.assignedTo = user.id;
    }

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
    const signed = await createScreenshotSignedUrl(ticket.attachmentUrl);
    return { url: signed.url, expires_at: signed.expiresAt };
  }

  async create(dto: CreateTicketDto, user: AuthUser) {
    this.assertOperational(user);
    if (!dto.incident_id && !dto.website_id) {
      throw new BadRequestException("website_id is required for a new ticket");
    }
    if (!dto.incident_id && (!dto.category || !dto.description?.trim() || !dto.expectation?.trim())) {
      throw new BadRequestException("category, description, and expectation are required for a new ticket");
    }

    const website = dto.website_id ? await this.assertWebsiteAccess(dto.website_id, user) : null;

    if (dto.incident_id) {
      const incident = await this.prisma.incident.findUnique({ where: { id: dto.incident_id } });
      if (!incident) throw new NotFoundException("Incident not found");
    }

    const assignedTo =
      dto.assigned_to ??
      (website ? website.itPicId ?? website.backupItPicId ?? null : null);

    const title = dto.title?.trim() || this.titleForCategory(dto.category);

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          incidentId: dto.incident_id,
          websiteId: dto.website_id,
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

      // Auto-create the developer's task so tickets and to-do work stay in one pipeline.
      if (created.websiteId && created.assignedTo) {
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

      return created;
    });

    return toTicketDto(ticket);
  }

  private titleForCategory(category?: TicketCategory) {
    switch (category) {
      case TicketCategory.website: return "Permintaan Website";
      case TicketCategory.help_desk: return "Permintaan Help Desk";
      case TicketCategory.procurement: return "Permintaan Procurement";
      default: return "Tiket Baru";
    }
  }

  private async getRecord(id: string, user: AuthUser) {
    this.assertOperational(user);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...(user.role === "pic_web" ? { website: { ownerId: user.id } } : {}) },
      include: TICKET_INCLUDE,
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async get(id: string, user: AuthUser) {
    return toTicketDto(await this.getRecord(id, user));
  }

  async update(id: string, dto: UpdateTicketDto, user: AuthUser) {
    this.assertOperational(user);
    const existing = await this.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Ticket not found");
    if (existing.status === TicketStatus.closed) {
      throw new BadRequestException("Closed tickets cannot be updated");
    }
    if (user.role === "pic_web") {
      throw new ForbiddenException("PIC Web cannot update tickets");
    }
    if (user.role === "developer") {
      if (existing.assignedTo !== user.id) {
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

      if (canEditSla && (dto.assigned_to !== undefined || dto.sla_deadline !== undefined)) {
        await this.syncTaskFromTicket(tx, updated);
      }

      return updated;
    });

    return toTicketDto(ticket);
  }

  /** Keep the linked task's assignee/deadline aligned with the ticket after Bos IT/Superadmin edits it. */
  private async syncTaskFromTicket(
    tx: Prisma.TransactionClient,
    ticket: {
      id: string;
      title: string;
      websiteId: string | null;
      assignedTo: string | null;
      slaDeadline: Date | null;
    },
  ) {
    if (!ticket.assignedTo) return;

    const existingTask = await tx.task.findUnique({ where: { ticketId: ticket.id } });
    if (existingTask) {
      await tx.task.update({
        where: { id: existingTask.id },
        data: {
          assigneeId: ticket.assignedTo,
          slaDeadline: ticket.slaDeadline,
        },
      });
      return;
    }

    if (ticket.websiteId) {
      await tx.task.create({
        data: {
          websiteId: ticket.websiteId,
          assigneeId: ticket.assignedTo,
          ticketId: ticket.id,
          instructionNotes: `Tiket: ${ticket.title}`,
          slaDeadline: ticket.slaDeadline,
          status: TaskStatus.pending,
        },
      });
    }
  }
}
