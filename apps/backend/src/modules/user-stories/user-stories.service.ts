import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  ProjectMemberType,
  TaskStatus,
  TicketStatus,
  UserRole,
  UserStoryStatus,
} from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../../common/current-user.decorator";
import { paginatedMeta, toTaskDto } from "../../common/mappers";
import { canManageProjectConfiguration, projectVisibilityWhere } from "../../common/resource-access";
import type { CreateUserStoryDto, UpdateUserStoryDto, UserStoriesQueryDto } from "./user-stories.dto";

const USER_SUMMARY = { id: true, name: true, email: true, role: true, isActive: true } as const;

const STORY_INCLUDE = {
  project: { select: { id: true, name: true } },
  website: { select: { id: true, name: true, domain: true } },
  primaryDeveloper: { select: USER_SUMMARY },
  collaborators: { include: { user: { select: USER_SUMMARY } } },
  tickets: { select: { id: true, title: true, status: true } },
} as const;

const LEGACY_TASK_INCLUDE = {
  ticket: { select: { id: true, description: true, expectation: true, attachmentUrl: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

type StoryRecord = Prisma.UserStoryGetPayload<{ include: typeof STORY_INCLUDE }>;

const DEVELOPER_STATUS_OPTIONS: UserStoryStatus[] = [
  UserStoryStatus.in_progress,
  UserStoryStatus.review,
  UserStoryStatus.done,
  UserStoryStatus.blocked,
];

@Injectable()
export class UserStoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProject(projectId: string, pagination: UserStoriesQueryDto, filters: UserStoriesQueryDto, user: AuthUser) {
    const project = await this.requireProjectView(projectId, user);
    const where: Prisma.UserStoryWhereInput = {
      AND: [
        { projectId },
        this.projectStoryScope(project, user),
        this.buildFilters(filters),
      ],
    };
    return this.paginate(where, pagination);
  }

  async list(pagination: UserStoriesQueryDto, filters: UserStoriesQueryDto, user: AuthUser) {
    this.assertCanViewStories(user);
    const where: Prisma.UserStoryWhereInput = {
      AND: [this.buildFilters(filters), this.globalStoryScope(user)],
    };
    return this.paginate(where, pagination);
  }

  async get(id: string, user: AuthUser) {
    this.assertCanViewStories(user);
    const story = await this.prisma.userStory.findFirst({
      where: { id, ...this.globalStoryScope(user) },
      include: STORY_INCLUDE,
    });
    if (!story) throw new NotFoundException("User story not found");
    return this.toStoryDto(story);
  }

  async create(projectId: string, dto: CreateUserStoryDto, user: AuthUser) {
    const project = await this.requireProjectManager(projectId, user);
    return this.createInProject(project, dto, user);
  }

  async createFromTicket(ticketId: string, dto: CreateUserStoryDto, user: AuthUser) {
    this.assertCanManageStories(user);
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        ...(canManageProjectConfiguration(user)
          ? {}
          : {
              OR: [
                { project: { picDeveloperId: user.id } },
                { website: { project: { picDeveloperId: user.id } } },
              ],
            }),
      },
      include: {
        website: { select: { id: true, projectId: true } },
        userStory: { select: { id: true } },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.userStory) throw new ConflictException("Ticket is already linked to a user story");
    const projectId = ticket.projectId ?? ticket.website?.projectId;
    if (!projectId) throw new BadRequestException("A general ticket must be linked to a Project before it can become a story");

    const project = await this.requireProjectManager(projectId, user);
    const storyDto: CreateUserStoryDto = {
      ...dto,
      title: dto.title?.trim() || `Tindak lanjut: ${ticket.title}`,
      description: dto.description ?? ticket.description ?? undefined,
      acceptance_criteria: dto.acceptance_criteria ?? ticket.expectation ?? undefined,
      website_id: dto.website_id ?? ticket.websiteId ?? ticket.website?.id ?? null,
    };
    const story = await this.createInProject(project, storyDto, user, ticketId);
    return story;
  }

  async update(id: string, dto: UpdateUserStoryDto, user: AuthUser) {
    const existing = await this.prisma.userStory.findUnique({
      where: { id },
      include: { project: { select: { id: true, picDeveloperId: true } }, collaborators: { select: { userId: true } } },
    });
    if (!existing) throw new NotFoundException("User story not found");

    const isManager = await this.canManageProject(existing.project.id, user);
    if (!isManager) {
      if (user.role !== UserRole.developer || !this.isAssigned(existing, user.id)) {
        throw new NotFoundException("User story not found");
      }
      const nonStatusFields = [
        dto.title,
        dto.description,
        dto.acceptance_criteria,
        dto.website_id,
        dto.priority,
        dto.primary_developer_id,
        dto.collaborator_ids,
        dto.due_date,
      ];
      if (nonStatusFields.some((value) => value !== undefined)) {
        throw new ForbiddenException("Developers may only update the status of an assigned story");
      }
      if (!dto.status || !DEVELOPER_STATUS_OPTIONS.includes(dto.status)) {
        throw new BadRequestException("Developer story status must be in_progress, review, done, or blocked");
      }
    }

    if (dto.website_id !== undefined) await this.assertWebsiteBelongsToProject(dto.website_id, existing.project.id);
    const assignmentIds = dto.collaborator_ids ?? existing.collaborators.map((row) => row.userId);
    const primaryId = dto.primary_developer_id === undefined ? existing.primaryDeveloperId : dto.primary_developer_id;
    if (isManager) await this.validateAssignees(existing.project.id, primaryId, assignmentIds);
    if (primaryId && assignmentIds.includes(primaryId)) {
      throw new BadRequestException("Primary developer must not be duplicated as a collaborator");
    }

    const nextStatus = dto.status ?? existing.status;
    const story = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userStory.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
          acceptanceCriteria:
            dto.acceptance_criteria === undefined ? undefined : dto.acceptance_criteria?.trim() || null,
          websiteId: dto.website_id === undefined ? undefined : dto.website_id,
          priority: dto.priority,
          status: dto.status,
          primaryDeveloperId: isManager ? primaryId : undefined,
          dueDate: dto.due_date === undefined ? undefined : dto.due_date ? new Date(dto.due_date) : null,
          completedAt: nextStatus === UserStoryStatus.done ? existing.completedAt ?? new Date() : null,
        },
        include: STORY_INCLUDE,
      });

      if (isManager && dto.collaborator_ids !== undefined) {
        await tx.storyCollaborator.deleteMany({ where: { storyId: id } });
        if (assignmentIds.length > 0) {
          await tx.storyCollaborator.createMany({
            data: assignmentIds.map((userId) => ({ storyId: id, userId })),
          });
        }
      }
      await this.syncTicketsFromStory(tx, id, nextStatus);
      return updated;
    });
    return this.get(id, user);
  }

  async meWork(user: AuthUser) {
    if (user.role !== UserRole.developer) {
      throw new ForbiddenException("My Work is available for developers");
    }
    const stories = await this.prisma.userStory.findMany({
      where: {
        OR: [
          { primaryDeveloperId: user.id },
          { collaborators: { some: { userId: user.id } } },
        ],
      },
      include: STORY_INCLUDE,
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    });
    const legacyTasks = await this.prisma.task.findMany({
      where: { assigneeId: user.id },
      include: LEGACY_TASK_INCLUDE,
      orderBy: [{ slaDeadline: "asc" }, { updatedAt: "desc" }],
    });
    const now = new Date();
    const pendingStatuses: UserStoryStatus[] = [UserStoryStatus.backlog, UserStoryStatus.ready];
    const activeStatuses: UserStoryStatus[] = [
      UserStoryStatus.in_progress,
      UserStoryStatus.review,
      UserStoryStatus.blocked,
    ];
    return {
      stories: stories.map((story) => this.toStoryDto(story)),
      legacy_tasks: legacyTasks.map(toTaskDto),
      summary: {
        pending: stories.filter((story) => pendingStatuses.includes(story.status)).length,
        in_progress: stories.filter((story) => activeStatuses.includes(story.status)).length,
        overdue: stories.filter((story) => story.status !== UserStoryStatus.done && story.dueDate && story.dueDate < now).length
          + legacyTasks.filter((task) => task.status !== TaskStatus.done && task.slaDeadline && task.slaDeadline < now).length,
        done: stories.filter((story) => story.status === UserStoryStatus.done).length,
      },
    };
  }

  private async paginate(where: Prisma.UserStoryWhereInput, pagination: UserStoriesQueryDto) {
    const [total, stories] = await this.prisma.$transaction([
      this.prisma.userStory.count({ where }),
      this.prisma.userStory.findMany({
        where,
        include: STORY_INCLUDE,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      }),
    ]);
    return {
      data: stories.map((story) => this.toStoryDto(story)),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  private async createInProject(
    project: { id: string },
    dto: CreateUserStoryDto,
    user: AuthUser,
    ticketId?: string,
  ) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException("Story title is required");
    await this.assertWebsiteBelongsToProject(dto.website_id ?? null, project.id);
    const collaboratorIds = [...new Set(dto.collaborator_ids ?? [])];
    if (dto.primary_developer_id && collaboratorIds.includes(dto.primary_developer_id)) {
      throw new BadRequestException("Primary developer must not be duplicated as a collaborator");
    }
    await this.validateAssignees(project.id, dto.primary_developer_id ?? null, collaboratorIds);

    const story = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userStory.create({
        data: {
          projectId: project.id,
          websiteId: dto.website_id ?? null,
          title,
          description: dto.description?.trim() || null,
          acceptanceCriteria: dto.acceptance_criteria?.trim() || null,
          priority: dto.priority,
          primaryDeveloperId: dto.primary_developer_id ?? null,
          dueDate: dto.due_date ? new Date(dto.due_date) : null,
          createdById: user.id,
          ...(collaboratorIds.length > 0
            ? { collaborators: { create: collaboratorIds.map((userId) => ({ userId })) } }
            : {}),
        },
        include: STORY_INCLUDE,
      });
      if (ticketId) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { projectId: project.id, userStoryId: created.id, status: TicketStatus.in_progress },
        });
      }
      return created;
    });
    return this.toStoryDto(story);
  }

  private async requireProjectView(projectId: string, user: AuthUser) {
    this.assertCanViewStories(user);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...projectVisibilityWhere(user) },
      select: {
        id: true,
        picDeveloperId: true,
        members: { where: { memberType: ProjectMemberType.developer }, select: { userId: true } },
      },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async requireProjectManager(projectId: string, user: AuthUser) {
    const project = await this.requireProjectView(projectId, user);
    if (!(await this.canManageProject(project, user))) {
      throw new ForbiddenException("Only the Project PIC Developer or platform admins can manage stories");
    }
    return project;
  }

  private async canManageProject(projectId: string, user: AuthUser): Promise<boolean>;
  private async canManageProject(project: { id: string; picDeveloperId: string | null }, user: AuthUser): Promise<boolean>;
  private async canManageProject(
    projectOrId: string | { id: string; picDeveloperId: string | null },
    user: AuthUser,
  ): Promise<boolean> {
    if (canManageProjectConfiguration(user)) return true;
    if (user.role !== UserRole.developer) return false;
    const project = typeof projectOrId === "string"
      ? await this.prisma.project.findUnique({ where: { id: projectOrId }, select: { id: true, picDeveloperId: true } })
      : projectOrId;
    return project?.picDeveloperId === user.id;
  }

  private projectStoryScope(
    project: { picDeveloperId: string | null; members: Array<{ userId: string }> },
    user: AuthUser,
  ): Prisma.UserStoryWhereInput {
    if (canManageProjectConfiguration(user) || project.picDeveloperId === user.id) return {};
    return {
      OR: [
        { primaryDeveloperId: user.id },
        { collaborators: { some: { userId: user.id } } },
      ],
    };
  }

  private globalStoryScope(user: AuthUser): Prisma.UserStoryWhereInput {
    if (canManageProjectConfiguration(user)) return {};
    return {
      OR: [
        { project: { picDeveloperId: user.id } },
        { primaryDeveloperId: user.id },
        { collaborators: { some: { userId: user.id } } },
      ],
    };
  }

  private buildFilters(filters: UserStoriesQueryDto): Prisma.UserStoryWhereInput {
    const where: Prisma.UserStoryWhereInput = {};
    if (filters.project_id) where.projectId = filters.project_id;
    if (filters.website_id) where.websiteId = filters.website_id;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.developer_id) {
      where.OR = [
        { primaryDeveloperId: filters.developer_id },
        { collaborators: { some: { userId: filters.developer_id } } },
      ];
    }
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.title = { contains: search, mode: "insensitive" };
    }
    if (filters.has_ticket) where.tickets = { some: {} };
    if (filters.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { not: UserStoryStatus.done };
    }
    return where;
  }

  private async validateAssignees(projectId: string, primaryId: string | null | undefined, collaboratorIds: string[]) {
    const ids = [...new Set([primaryId, ...collaboratorIds].filter(Boolean) as string[])];
    if (ids.length === 0) return;
    const [users, memberships] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, isActive: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId: { in: ids }, memberType: ProjectMemberType.developer }, select: { userId: true } }),
    ]);
    const validMembers = new Set(memberships.map((member) => member.userId));
    if (users.length !== ids.length || users.some((candidate) => candidate.role !== UserRole.developer || !candidate.isActive)) {
      throw new BadRequestException("Story assignees must be active developers");
    }
    if (validMembers.size !== ids.length) {
      throw new BadRequestException("Story assignees must belong to the Project developer team");
    }
  }

  private async assertWebsiteBelongsToProject(websiteId: string | null, projectId: string) {
    if (!websiteId) return;
    const website = await this.prisma.website.findFirst({ where: { id: websiteId, projectId }, select: { id: true } });
    if (!website) throw new BadRequestException("Website must belong to the selected Project");
  }

  private async syncTicketsFromStory(tx: Prisma.TransactionClient, storyId: string, status: UserStoryStatus) {
    if (status === UserStoryStatus.done) {
      await tx.ticket.updateMany({
        where: { userStoryId: storyId, status: { in: [TicketStatus.open, TicketStatus.in_progress] } },
        data: { status: TicketStatus.resolved, resolvedAt: new Date() },
      });
    } else if (status === UserStoryStatus.in_progress || status === UserStoryStatus.review) {
      await tx.ticket.updateMany({
        where: { userStoryId: storyId, status: TicketStatus.open },
        data: { status: TicketStatus.in_progress },
      });
    }
  }

  private isAssigned(story: { primaryDeveloperId: string | null; collaborators: Array<{ userId: string }> }, userId: string) {
    return story.primaryDeveloperId === userId || story.collaborators.some((row) => row.userId === userId);
  }

  private toStoryDto(story: StoryRecord) {
    const isOverdue = Boolean(
      story.dueDate && story.status !== UserStoryStatus.done && story.dueDate < new Date(),
    );
    return {
      id: story.id,
      project_id: story.projectId,
      website_id: story.websiteId,
      title: story.title,
      description: story.description,
      acceptance_criteria: story.acceptanceCriteria,
      priority: story.priority,
      status: story.status,
      primary_developer_id: story.primaryDeveloperId,
      due_date: story.dueDate,
      created_by_id: story.createdById,
      completed_at: story.completedAt,
      created_at: story.createdAt,
      updated_at: story.updatedAt,
      project: story.project,
      website: story.website,
      primary_developer: story.primaryDeveloper ? this.toUserSummary(story.primaryDeveloper) : null,
      collaborators: story.collaborators.map((row) => this.toUserSummary(row.user)),
      tickets: story.tickets,
      is_overdue: isOverdue,
    };
  }

  private toUserSummary(user: { id: string; name: string; email: string; role: UserRole; isActive: boolean }) {
    return { id: user.id, name: user.name, email: user.email, role: user.role, is_active: user.isActive };
  }

  private assertCanViewStories(user: AuthUser) {
    if (user.role !== UserRole.superadmin && user.role !== UserRole.bos_it && user.role !== UserRole.developer) {
      throw new ForbiddenException("User stories are not available for this role");
    }
  }

  private assertCanManageStories(user: AuthUser) {
    this.assertCanViewStories(user);
  }
}
