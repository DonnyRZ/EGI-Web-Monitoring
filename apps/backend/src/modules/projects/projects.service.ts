import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  IncidentStatus,
  Prisma,
  ProjectMemberType,
  ProjectStatus,
  TaskStatus,
  TicketStatus,
  UserRole,
  UserStoryStatus,
} from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../../common/current-user.decorator";
import { assertSafeMonitoringUrl } from "../../common/monitoring-url";
import { paginatedMeta, toWebsiteDto } from "../../common/mappers";
import { projectVisibilityWhere, canManageProjectConfiguration } from "../../common/resource-access";
import {
  AddProjectWebsiteDto,
  CreateProjectDto,
  ProjectsQueryDto,
  UpdateProjectAssignmentsDto,
  UpdateProjectDto,
  UpdateProjectWebsitesDto,
} from "./projects.dto";

const USER_SUMMARY = { id: true, name: true, email: true, role: true, isActive: true } as const;

const projectListInclude = (now: Date) => ({
  websites: {
    select: {
      id: true,
      name: true,
      domain: true,
      url: true,
      projectId: true,
      ownerId: true,
      itPicId: true,
      backupItPicId: true,
      monitoringIntervalMinutes: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      monitoringResults: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  },
  members: { include: { user: { select: USER_SUMMARY } } },
  picDeveloper: { select: USER_SUMMARY },
  userStories: {
    where: { status: { not: UserStoryStatus.done }, dueDate: { lt: now } },
    select: { id: true },
  },
  _count: {
    select: {
      websites: true,
      members: true,
      userStories: { where: { status: { not: UserStoryStatus.done } } },
      tickets: { where: { status: { in: [TicketStatus.open, TicketStatus.in_progress] } } },
    },
  },
} satisfies Prisma.ProjectInclude);

const projectDetailInclude = (now: Date) => ({
  websites: {
    include: {
      monitoringResults: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: {
          id: true,
          websiteId: true,
          scheduledAt: true,
          checkedAt: true,
          status: true,
          httpStatus: true,
          responseTimeMs: true,
          renderTimeMs: true,
          screenshotUrl: true,
          errorMessage: true,
          createdAt: true,
        },
      },
      incidents: {
        where: { status: { in: [IncidentStatus.open, IncidentStatus.in_progress] } },
        select: { id: true },
      },
    },
  },
  members: { include: { user: { select: USER_SUMMARY } } },
  picDeveloper: { select: USER_SUMMARY },
  userStories: {
    where: { status: { not: UserStoryStatus.done }, dueDate: { lt: now } },
    select: { id: true },
  },
  tickets: {
    where: { status: TicketStatus.open, userStoryId: null },
    select: { id: true },
  },
  _count: {
    select: {
      websites: true,
      members: true,
      userStories: { where: { status: { not: UserStoryStatus.done } } },
      tickets: { where: { status: { in: [TicketStatus.open, TicketStatus.in_progress] } } },
    },
  },
} satisfies Prisma.ProjectInclude);

type ProjectListRecord = Prisma.ProjectGetPayload<{ include: ReturnType<typeof projectListInclude> }>;
type ProjectDetailRecord = Prisma.ProjectGetPayload<{ include: ReturnType<typeof projectDetailInclude> }>;

type HealthStatus = "normal" | "warning" | "down" | "unknown";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: ProjectsQueryDto, filters: ProjectsQueryDto, user: AuthUser) {
    this.assertCanView(user);
    const where = this.buildWhere(filters, user);
    const include = projectListInclude(new Date());

    const [total, projects] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: [{ status: "asc" }, { name: "asc" }],
      }),
    ]);

    return {
      data: projects.map((project) => this.toListDto(project)),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async get(id: string, user: AuthUser) {
    this.assertCanView(user);
    const project = await this.prisma.project.findFirst({
      where: { id, ...projectVisibilityWhere(user) },
      include: projectDetailInclude(new Date()),
    });
    if (!project) throw new NotFoundException("Project not found");
    const scopedUntriagedCount = user.role === UserRole.developer && project.picDeveloperId !== user.id
      ? await this.prisma.ticket.count({
          where: {
            projectId: id,
            status: TicketStatus.open,
            userStoryId: null,
            assignedTo: user.id,
          },
        })
      : undefined;
    return this.toDetailDto(project, user, scopedUntriagedCount);
  }

  async scopeSummary(user: AuthUser) {
    this.assertCanView(user);
    if (user.role !== UserRole.developer) {
      return { has_pic_developer: false };
    }
    const project = await this.prisma.project.findFirst({
      where: { picDeveloperId: user.id, ...projectVisibilityWhere(user) },
      select: { id: true },
    });
    return { has_pic_developer: Boolean(project) };
  }

  async create(dto: CreateProjectDto, user: AuthUser) {
    this.assertCanManage(user);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Project name is required");
    if (dto.status === ProjectStatus.active) {
      throw new BadRequestException("A project must have at least one website before it can be active");
    }

    const project = await this.prisma.project.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        status: dto.status ?? ProjectStatus.draft,
        createdById: user.id,
      },
        include: projectDetailInclude(new Date()),
    });
    return this.toDetailDto(project, user);
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthUser) {
    this.assertCanManage(user);
    const current = await this.requireAdminProject(id);
    const nextStatus = dto.status ?? current.status;
    if (nextStatus === ProjectStatus.active && current.websites.length === 0) {
      throw new BadRequestException("An active project must have at least one website");
    }

    const name = dto.name === undefined ? undefined : dto.name.trim();
    if (name !== undefined && !name) throw new BadRequestException("Project name is required");

    await this.prisma.project.update({
      where: { id },
      data: {
        name,
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        status: dto.status,
      },
    });
    return this.get(id, user);
  }

  async updateAssignments(id: string, dto: UpdateProjectAssignmentsDto, user: AuthUser) {
    this.assertCanManage(user);
    const project = await this.requireAdminProject(id);
    const picWebIds = this.uniqueIds(dto.pic_web_ids);
    const developerIds = this.uniqueIds(dto.developer_ids);
    const allIds = [...new Set([...picWebIds, ...developerIds, dto.pic_developer_id].filter(Boolean) as string[])];
    const users = await this.prisma.user.findMany({ where: { id: { in: allIds } } });
    const usersById = new Map(users.map((candidate) => [candidate.id, candidate]));

    if (users.length !== allIds.length) throw new BadRequestException("One or more assignment users were not found");
    for (const candidate of users) {
      if (!candidate.isActive) throw new BadRequestException(`${candidate.name} is inactive and cannot be assigned`);
    }
    this.assertUserRoles(picWebIds, usersById, UserRole.pic_web, "PIC Web");
    this.assertUserRoles(developerIds, usersById, UserRole.developer, "Developer team");
    if (dto.pic_developer_id) {
      const picDeveloper = usersById.get(dto.pic_developer_id);
      if (!picDeveloper || picDeveloper.role !== UserRole.developer) {
        throw new BadRequestException("PIC Developer must be an active user with the developer role");
      }
    }

    const oldMemberships = await this.prisma.projectMember.findMany({
      where: { projectId: id, memberType: ProjectMemberType.developer },
      select: { userId: true },
    });
    const removedDeveloperIds = oldMemberships
      .map((membership) => membership.userId)
      .filter((memberId) => !developerIds.includes(memberId));
    const warnings: string[] = [];
    if (removedDeveloperIds.length > 0) {
      const activeStoryCount = await this.prisma.userStory.count({
        where: {
          projectId: id,
          status: { notIn: [UserStoryStatus.done] },
          OR: [
            { primaryDeveloperId: { in: removedDeveloperIds } },
            { collaborators: { some: { userId: { in: removedDeveloperIds } } } },
          ],
        },
      });
      if (activeStoryCount > 0) {
        warnings.push(
          `${activeStoryCount} user story aktif masih melibatkan developer yang akan dihapus. Histori story tetap dipertahankan.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { picDeveloperId: dto.pic_developer_id ?? null } });
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      const members = [
        ...picWebIds.map((userId) => ({ projectId: id, userId, memberType: ProjectMemberType.pic_web })),
        ...developerIds.map((userId) => ({ projectId: id, userId, memberType: ProjectMemberType.developer })),
      ];
      if (members.length > 0) await tx.projectMember.createMany({ data: members });
    });

    return { ...(await this.get(id, user)), warnings };
  }

  async updateWebsites(id: string, dto: UpdateProjectWebsitesDto, user: AuthUser) {
    this.assertCanManage(user);
    const project = await this.requireAdminProject(id);
    const websiteIds = this.uniqueIds(dto.website_ids);
    if (project.status === ProjectStatus.active && websiteIds.length === 0) {
      throw new BadRequestException("An active project must have at least one website");
    }

    const websites = await this.prisma.website.findMany({ where: { id: { in: websiteIds } } });
    if (websites.length !== websiteIds.length) throw new NotFoundException("One or more websites were not found");
    const conflicting = websites.find((website) => website.projectId && website.projectId !== id);
    if (conflicting) throw new ConflictException(`${conflicting.name} is already assigned to another project`);

    await this.prisma.$transaction(async (tx) => {
      await tx.website.updateMany({ where: { projectId: id, id: { notIn: websiteIds } }, data: { projectId: null } });
      if (websiteIds.length > 0) {
        await tx.website.updateMany({ where: { id: { in: websiteIds } }, data: { projectId: id } });
      }
    });
    return this.get(id, user);
  }

  async addWebsite(id: string, dto: AddProjectWebsiteDto, user: AuthUser) {
    this.assertCanManage(user);
    const project = await this.requireAdminProject(id);
    if (dto.website_id) {
      const website = await this.prisma.website.findUnique({ where: { id: dto.website_id } });
      if (!website) throw new NotFoundException("Website not found");
      if (website.projectId && website.projectId !== id) {
        throw new ConflictException("Website is already assigned to another project");
      }
      await this.prisma.website.update({ where: { id: website.id }, data: { projectId: id } });
      return this.get(id, user);
    }

    if (!dto.name?.trim() || !dto.domain?.trim() || !dto.url?.trim()) {
      throw new BadRequestException("name, domain, and url are required when creating a website");
    }
    await assertSafeMonitoringUrl(dto.url);
    await this.prisma.website.create({
      data: {
        name: dto.name.trim(),
        domain: dto.domain.trim(),
        url: dto.url.trim(),
        projectId: project.id,
        monitoringIntervalMinutes: dto.monitoring_interval_minutes ?? 5,
        isActive: true,
      },
    });
    return this.get(id, user);
  }

  async removeWebsite(id: string, websiteId: string, user: AuthUser) {
    this.assertCanManage(user);
    const project = await this.requireAdminProject(id);
    const website = await this.prisma.website.findFirst({ where: { id: websiteId, projectId: id } });
    if (!website) throw new NotFoundException("Website is not assigned to this project");
    if (project.status === ProjectStatus.active && project.websites.length <= 1) {
      throw new BadRequestException("An active project must have at least one website");
    }
    await this.prisma.website.update({ where: { id: websiteId }, data: { projectId: null } });
    return this.get(id, user);
  }

  async roster(role: "pic_web" | "developer", user: AuthUser) {
    this.assertCanManage(user);
    const targetRole = role === "pic_web" ? UserRole.pic_web : UserRole.developer;
    const users = await this.prisma.user.findMany({
      where: { role: targetRole, isActive: true },
      orderBy: { name: "asc" },
      select: {
        ...USER_SUMMARY,
        primaryUserStories: {
          where: { status: { notIn: [UserStoryStatus.done] } },
          select: { id: true, dueDate: true },
        },
        storyCollaborations: {
          where: { story: { status: { notIn: [UserStoryStatus.done] } } },
          select: { story: { select: { id: true, dueDate: true } } },
        },
      },
    });
    return users.map((candidate) => {
      const storyRows = [
        ...candidate.primaryUserStories,
        ...candidate.storyCollaborations.map((row) => row.story),
      ];
      return {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        role: candidate.role,
        is_active: candidate.isActive,
        active_workload: new Set(storyRows.map((story) => story.id)).size,
        overdue_workload: storyRows.filter((story) => story.dueDate && story.dueDate < new Date()).length,
      };
    });
  }

  private buildWhere(filters: ProjectsQueryDto, user: AuthUser): Prisma.ProjectWhereInput {
    const where: Prisma.ProjectWhereInput = { ...projectVisibilityWhere(user) };
    if (filters.status) where.status = filters.status;
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            {
              websites: {
                some: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { domain: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        },
      ];
    }
    if (filters.missing_pic_web) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { members: { none: { memberType: ProjectMemberType.pic_web } } },
      ];
    }
    if (filters.missing_pic_developer) where.picDeveloperId = null;
    if (filters.missing_developer_team) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { members: { none: { memberType: ProjectMemberType.developer } } },
      ];
    }
    if (filters.has_active_tickets) where.tickets = { some: { status: { in: [TicketStatus.open, TicketStatus.in_progress] } } };
    if (filters.has_overdue_work) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            {
              userStories: {
                some: {
                  dueDate: { lt: new Date() },
                  status: { notIn: [UserStoryStatus.done] },
                },
              },
            },
            {
              websites: {
                some: {
                  tasks: {
                    some: { slaDeadline: { lt: new Date() }, status: { not: TaskStatus.done } },
                  },
                },
              },
            },
          ],
        },
      ];
    }
    return where;
  }

  private toListDto(project: ProjectListRecord) {
    const health = this.healthFromWebsites(project.websites);
    const picWeb = project.members.filter((member) => member.memberType === ProjectMemberType.pic_web);
    const developers = project.members.filter((member) => member.memberType === ProjectMemberType.developer);
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      pic_developer_id: project.picDeveloperId,
      created_by_id: project.createdById,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      websites_count: project._count.websites,
      active_websites_count: project.websites.filter((website) => website.isActive).length,
      active_tickets_count: project._count.tickets,
      active_stories_count: project._count.userStories,
      overdue_count: project.userStories.length,
      health,
      configuration_status: this.configurationStatus(project.websites.length, picWeb.length, Boolean(project.picDeveloperId), developers.length),
      pic_developer: this.toUserSummary(project.picDeveloper),
      pic_web: picWeb.map((member) => this.toUserSummary(member.user)),
      developers: developers.map((member) => this.toUserSummary(member.user)),
    };
  }

  private toDetailDto(project: ProjectDetailRecord, user: AuthUser, scopedUntriagedCount?: number) {
    const summary = this.toListDto(project as unknown as ProjectListRecord);
    const websites = project.websites.map((website) => ({
      ...toWebsiteDto(website),
      latest_result: website.monitoringResults[0] ?? null,
    }));
    const activeIncidentsCount = project.websites.reduce(
      (sum, website) => sum + (website.incidents?.length ?? 0),
      0,
    );
    return {
      ...summary,
      websites,
      health_summary: this.healthSummaryFromWebsites(project.websites),
      active_incidents_count: activeIncidentsCount,
      untriaged_tickets_count: scopedUntriagedCount ?? project.tickets.length,
    };
  }

  private healthFromWebsites(websites: Array<{ monitoringResults: Array<{ status: string }> }>): HealthStatus {
    const statuses = websites.flatMap((website) => website.monitoringResults.map((result) => result.status as HealthStatus));
    if (statuses.includes("down")) return "down";
    if (statuses.includes("warning")) return "warning";
    if (statuses.length === 0 || statuses.includes("unknown")) return "unknown";
    return "normal";
  }

  private healthSummaryFromWebsites(websites: Array<{ monitoringResults: Array<{ status: string }> }>) {
    const counts = { normal: 0, warning: 0, down: 0, unknown: 0 };
    for (const website of websites) {
      const status = (website.monitoringResults[0]?.status as HealthStatus | undefined) ?? "unknown";
      counts[status] += 1;
    }
    return { status: this.healthFromWebsites(websites), ...counts };
  }

  private configurationStatus(websiteCount: number, picWebCount: number, hasPicDeveloper: boolean, developerCount: number) {
    return websiteCount === 0 || (picWebCount === 0 && !hasPicDeveloper && developerCount === 0)
      ? "needs_setup"
      : "ready";
  }

  private toUserSummary(user: { id: string; name: string; email: string; role: UserRole; isActive: boolean } | null) {
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, is_active: user.isActive };
  }

  private assertUserRoles(
    ids: string[],
    users: Map<string, { name: string; role: UserRole; isActive: boolean }>,
    expectedRole: UserRole,
    label: string,
  ) {
    for (const id of ids) {
      const candidate = users.get(id);
      if (!candidate || !candidate.isActive || candidate.role !== expectedRole) {
        throw new BadRequestException(`${label} must contain only active users with role ${expectedRole}`);
      }
    }
  }

  private uniqueIds(ids: string[]) {
    return [...new Set(ids)];
  }

  private assertCanView(user: AuthUser) {
    if (!["superadmin", "bos_it", "developer", "pic_web"].includes(user.role)) {
      throw new ForbiddenException("Project access is not available for this role");
    }
  }

  private assertCanManage(user: AuthUser) {
    if (!canManageProjectConfiguration(user)) {
      throw new ForbiddenException("Only Superadmin or Bos IT can manage project configuration");
    }
  }

  private async requireAdminProject(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { websites: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
