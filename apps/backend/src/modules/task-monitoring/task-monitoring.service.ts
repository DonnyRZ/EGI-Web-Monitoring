import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  ProjectMemberType,
  TaskBusinessStatus,
  TaskStatus,
  UserRole,
  UserStoryStatus,
} from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../../common/current-user.decorator";
import { paginatedMeta } from "../../common/mappers";
import { projectVisibilityWhere } from "../../common/resource-access";
import type { TaskMonitoringQueryDto, UpdateTaskMonitoringStatusDto } from "./task-monitoring.dto";
import { isTaskOverdue, needsTaskAction, rollupTaskStatus } from "./task-monitoring.rollup";

const USER_SUMMARY = { id: true, name: true, email: true, role: true, isActive: true } as const;

const STORY_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  primaryDeveloper: { select: USER_SUMMARY },
  collaborators: { include: { user: { select: USER_SUMMARY } } },
} as const;

const TICKET_SELECT = {
  id: true,
  title: true,
  description: true,
  expectation: true,
  attachmentUrl: true,
  category: true,
  priority: true,
  status: true,
  slaDeadline: true,
  updatedAt: true,
  taskStatusOverride: true,
  project: {
    select: {
      id: true,
      name: true,
      picDeveloper: { select: USER_SUMMARY },
    },
  },
  website: { select: { id: true, name: true, domain: true, projectId: true } },
  assignee: { select: USER_SUMMARY },
  userStory: { select: STORY_SELECT },
  storyLinks: { include: { userStory: { select: STORY_SELECT } } },
} as const;

const LEGACY_TASK_SELECT = {
  id: true,
  instructionNotes: true,
  status: true,
  slaDeadline: true,
  updatedAt: true,
  website: {
    select: {
      id: true,
      name: true,
      domain: true,
      projectId: true,
      project: {
        select: {
          id: true,
          name: true,
          picDeveloper: { select: USER_SUMMARY },
        },
      },
    },
  },
  assignee: { select: USER_SUMMARY },
  ticket: { select: { id: true } },
} as const;

type TicketRecord = Prisma.TicketGetPayload<{ select: typeof TICKET_SELECT }>;
type LegacyTaskRecord = Prisma.TaskGetPayload<{ select: typeof LEGACY_TASK_SELECT }>;

type StoryRecord = TicketRecord["userStory"];

type MonitoringRow = {
  id: string;
  source: "task" | "legacy_task";
  source_id: string;
  title: string;
  summary: string | null;
  project: { id: string; name: string } | null;
  website: { id: string; name: string; domain: string } | null;
  status: TaskBusinessStatus;
  status_reason: "automatic" | "manual_override" | "waiting_pic_developer" | "legacy_task";
  priority: string;
  pic_developer: { id: string; name: string; email: string } | null;
  developers: Array<{ id: string; name: string; email: string; role: string }>;
  due_date: Date | null;
  last_update: Date;
  is_overdue: boolean;
  needs_action: boolean;
  stories: Array<{
    id: string;
    title: string;
    status: UserStoryStatus;
    priority: string;
    due_date: Date | null;
    primary_developer: { id: string; name: string; email: string } | null;
    collaborators: Array<{ id: string; name: string; email: string }>;
  }>;
  task: {
    problem: string | null;
    expectation: string | null;
    attachment_url: string | null;
    category: string | null;
  } | null;
};

@Injectable()
export class TaskMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: TaskMonitoringQueryDto, user: AuthUser) {
    this.assertCanView(user);
    const rows = await this.loadRows(user, query);
    const filtered = rows
      .filter((row) => this.matches(row, query))
      .sort((a, b) => {
        if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
        if (a.status === TaskBusinessStatus.done && b.status !== TaskBusinessStatus.done) return 1;
        if (a.status !== TaskBusinessStatus.done && b.status === TaskBusinessStatus.done) return -1;
        return b.last_update.getTime() - a.last_update.getTime();
      });

    const summary = this.summarize(filtered);
    const data = filtered
      .slice((query.page - 1) * query.limit, query.page * query.limit)
      .map((row) => this.toDto(row, user));

    return {
      data,
      summary,
      meta: paginatedMeta(query.page, query.limit, filtered.length),
    };
  }

  async filters(user: AuthUser) {
    this.assertCanView(user);
    const visibleProjects = await this.prisma.project.findMany({
      where: projectVisibilityWhere(user),
      select: {
        id: true,
        name: true,
        picDeveloper: { select: USER_SUMMARY },
        websites: { select: { id: true, name: true, domain: true } },
        members: {
          where: { memberType: ProjectMemberType.developer },
          include: { user: { select: USER_SUMMARY } },
        },
      },
      orderBy: { name: "asc" },
    });
    const projects = new Map<string, { id: string; name: string }>();
    const websites = new Map<string, { id: string; name: string; domain: string; project_id: string | null }>();
    const developers = new Map<string, { id: string; name: string; email: string; project_ids: Set<string> }>();

    for (const project of visibleProjects) {
      projects.set(project.id, { id: project.id, name: project.name });
      for (const website of project.websites) {
        websites.set(website.id, { ...website, project_id: project.id });
      }
      const projectDevelopers = [
        ...(project.picDeveloper ? [project.picDeveloper] : []),
        ...project.members.map((member) => member.user),
      ];
      for (const developer of projectDevelopers) {
        const current = developers.get(developer.id) ?? { ...this.userDto(developer), project_ids: new Set<string>() };
        current.project_ids.add(project.id);
        developers.set(developer.id, current);
      }
    }

    return {
      projects: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)),
      websites: [...websites.values()].sort((a, b) => a.name.localeCompare(b.name)),
      developers: [...developers.values()]
        .map((developer) => ({ ...developer, project_ids: [...developer.project_ids] }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async get(id: string, source: "task" | "legacy_task" | undefined, user: AuthUser) {
    this.assertCanView(user);
    const rows = await this.loadRows(user);
    const row = rows.find((candidate) => candidate.id === id || (candidate.source_id === id && (!source || candidate.source === source)));
    if (!row) throw new NotFoundException("Task not found");
    return this.toDto(row, user, true);
  }

  async updateStatus(id: string, dto: UpdateTaskMonitoringStatusDto, user: AuthUser) {
    if (user.role !== UserRole.superadmin && user.role !== UserRole.bos_it) {
      throw new ForbiddenException("Only Superadmin or Bos IT can override Task status");
    }
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) throw new NotFoundException("Task intake not found");
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        taskStatusOverride: dto.status ?? null,
        taskStatusOverrideBy: dto.status ? user.id : null,
        taskStatusOverrideAt: dto.status ? new Date() : null,
      },
    });
    return this.get(updated.id, "task", user);
  }

  private async loadRows(user: AuthUser, query?: TaskMonitoringQueryDto): Promise<MonitoringRow[]> {
    const ticketWhere: Prisma.TicketWhereInput = {
      AND: [this.ticketScope(user), { task: null }, this.ticketQueryWhere(query)],
    };
    const legacyWhere: Prisma.TaskWhereInput = {
      AND: [this.legacyTaskScope(user), this.legacyTaskQueryWhere(query)],
    };
    const [tickets, legacyTasks] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({ where: ticketWhere, select: TICKET_SELECT }),
      this.prisma.task.findMany({ where: legacyWhere, select: LEGACY_TASK_SELECT }),
    ]);
    return [
      ...tickets.map((ticket) => this.ticketRow(ticket)),
      ...legacyTasks.map((task) => this.legacyTaskRow(task)),
    ];
  }

  private ticketQueryWhere(query?: TaskMonitoringQueryDto): Prisma.TicketWhereInput {
    if (!query) return {};
    const where: Prisma.TicketWhereInput = {};
    if (query.project_id) where.projectId = query.project_id;
    if (query.website_id) where.websiteId = query.website_id;
    if (query.priority) where.priority = query.priority;
    if (query.developer_id) {
      where.OR = [
        { assignedTo: query.developer_id },
        { project: { picDeveloperId: query.developer_id } },
        { userStory: { OR: [{ primaryDeveloperId: query.developer_id }, { collaborators: { some: { userId: query.developer_id } } }] } },
        { storyLinks: { some: { userStory: { OR: [{ primaryDeveloperId: query.developer_id }, { collaborators: { some: { userId: query.developer_id } } }] } } } },
      ];
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { project: { name: { contains: search, mode: "insensitive" } } },
            { website: { name: { contains: search, mode: "insensitive" } } },
            { website: { domain: { contains: search, mode: "insensitive" } } },
          ],
        },
      ];
    }
    return where;
  }

  private legacyTaskQueryWhere(query?: TaskMonitoringQueryDto): Prisma.TaskWhereInput {
    if (!query) return {};
    const and: Prisma.TaskWhereInput[] = [];
    if (query.project_id) and.push({ website: { projectId: query.project_id } });
    if (query.website_id) and.push({ websiteId: query.website_id });
    if (query.priority && query.priority !== "medium") and.push({ id: "00000000-0000-0000-0000-000000000000" });
    if (query.developer_id) {
      and.push({ OR: [
        { assigneeId: query.developer_id },
        { website: { project: { picDeveloperId: query.developer_id } } },
      ] });
    }
    if (query.status) {
      const status = query.status === TaskBusinessStatus.new
        ? TaskStatus.pending
        : query.status === TaskBusinessStatus.in_progress
          ? TaskStatus.in_progress
        : query.status === TaskBusinessStatus.done
            ? TaskStatus.done
            : null;
      and.push(status ? { status } : { id: "00000000-0000-0000-0000-000000000000" });
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      and.push({ OR: [
        { instructionNotes: { contains: search, mode: "insensitive" } },
        { website: { name: { contains: search, mode: "insensitive" } } },
        { website: { domain: { contains: search, mode: "insensitive" } } },
      ] });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private ticketScope(user: AuthUser): Prisma.TicketWhereInput {
    if (user.role === UserRole.superadmin || user.role === UserRole.bos_it) return {};
    if (user.role === UserRole.pic_web) {
      return {
        OR: [
          { project: { members: { some: { userId: user.id, memberType: ProjectMemberType.pic_web } } } },
          { projectId: null, website: { ownerId: user.id } },
        ],
      };
    }
    if (user.role === UserRole.developer) {
      return {
        OR: [
          { project: { picDeveloperId: user.id } },
          { assignedTo: user.id },
          { userStory: { OR: [{ primaryDeveloperId: user.id }, { collaborators: { some: { userId: user.id } } }] } },
          { storyLinks: { some: { userStory: { OR: [{ primaryDeveloperId: user.id }, { collaborators: { some: { userId: user.id } } }] } } } },
        ],
      };
    }
    throw new ForbiddenException("Task Monitoring is not available for this role");
  }

  private legacyTaskScope(user: AuthUser): Prisma.TaskWhereInput {
    if (user.role === UserRole.superadmin || user.role === UserRole.bos_it) return {};
    if (user.role === UserRole.pic_web) {
      return {
        OR: [
          { website: { project: { members: { some: { userId: user.id, memberType: ProjectMemberType.pic_web } } } } },
          { website: { projectId: null, ownerId: user.id } },
        ],
      };
    }
    if (user.role === UserRole.developer) {
      return {
        OR: [
          { assigneeId: user.id },
          { website: { project: { picDeveloperId: user.id } } },
        ],
      };
    }
    throw new ForbiddenException("Task Monitoring is not available for this role");
  }

  private ticketRow(ticket: TicketRecord): MonitoringRow {
    const stories = this.storyRows(ticket);
    const status = this.rollupTicketStatus(ticket, stories);
    const dueDate = this.minDate([ticket.slaDeadline, ...stories.map((story) => story.due_date)]);
    const lastUpdate = new Date(Math.max(ticket.updatedAt.getTime(), ...stories.map((story) => story.updated_at.getTime())));
    const developers = this.developersFor(ticket, stories);
    const isOverdue = isTaskOverdue(status, dueDate);
    return {
      id: `task:${ticket.id}`,
      source: "task",
      source_id: ticket.id,
      title: ticket.title,
      summary: ticket.description,
      project: ticket.project ? { id: ticket.project.id, name: ticket.project.name } : null,
      website: ticket.website ? { id: ticket.website.id, name: ticket.website.name, domain: ticket.website.domain } : null,
      status,
      status_reason: ticket.taskStatusOverride ? "manual_override" : status === TaskBusinessStatus.waiting_pic ? "waiting_pic_developer" : "automatic",
      priority: ticket.priority,
      pic_developer: ticket.project?.picDeveloper ? this.userDto(ticket.project.picDeveloper) : null,
      developers,
      due_date: dueDate,
      last_update: lastUpdate,
      is_overdue: isOverdue,
      needs_action: needsTaskAction(status, isOverdue),
      stories,
      task: {
        problem: ticket.description,
        expectation: ticket.expectation,
        attachment_url: ticket.attachmentUrl,
        category: ticket.category,
      },
    };
  }

  private legacyTaskRow(task: LegacyTaskRecord): MonitoringRow {
    const status = task.status === TaskStatus.done ? TaskBusinessStatus.done : task.status === TaskStatus.in_progress ? TaskBusinessStatus.in_progress : TaskBusinessStatus.new;
    const isOverdue = isTaskOverdue(status, task.slaDeadline);
    return {
      id: `legacy:${task.id}`,
      source: "legacy_task",
      source_id: task.id,
      title: task.instructionNotes,
      summary: task.instructionNotes,
      project: task.website.project ? { id: task.website.project.id, name: task.website.project.name } : null,
      website: { id: task.website.id, name: task.website.name, domain: task.website.domain },
      status,
      status_reason: "legacy_task",
      priority: "medium",
      pic_developer: task.website.project?.picDeveloper ? this.userDto(task.website.project.picDeveloper) : null,
      developers: task.assignee ? [this.userDto(task.assignee)] : [],
      due_date: task.slaDeadline,
      last_update: task.updatedAt,
      is_overdue: isOverdue,
      needs_action: needsTaskAction(status, isOverdue),
      stories: [],
      task: { problem: task.ticket ? null : task.instructionNotes, expectation: null, attachment_url: null, category: null },
    };
  }

  private storyRows(ticket: TicketRecord) {
    const records = [ticket.userStory, ...ticket.storyLinks.map((link) => link.userStory)].filter(
      (story): story is NonNullable<StoryRecord> => Boolean(story),
    );
    const seen = new Set<string>();
    return records.filter((story) => {
      if (seen.has(story.id)) return false;
      seen.add(story.id);
      return true;
    }).map((story) => ({
      id: story.id,
      title: story.title,
      status: story.status,
      priority: story.priority,
      due_date: story.dueDate,
      updated_at: ticket.updatedAt,
      primary_developer: story.primaryDeveloper ? this.userDto(story.primaryDeveloper) : null,
      collaborators: story.collaborators.map((row) => this.userDto(row.user)),
    }));
  }

  private rollupTicketStatus(ticket: TicketRecord, stories: ReturnType<TaskMonitoringService["storyRows"]>): TaskBusinessStatus {
    return rollupTaskStatus({
      override: ticket.taskStatusOverride,
      ticketStatus: ticket.status,
      hasPicDeveloper: Boolean(ticket.project?.picDeveloper),
      storyStatuses: stories.map((story) => story.status),
    });
  }

  private developersFor(ticket: TicketRecord, stories: ReturnType<TaskMonitoringService["storyRows"]>) {
    const users = new Map<string, { id: string; name: string; email: string; role: string }>();
    if (ticket.assignee) users.set(ticket.assignee.id, this.userDto(ticket.assignee));
    if (ticket.project?.picDeveloper) users.set(ticket.project.picDeveloper.id, this.userDto(ticket.project.picDeveloper));
    for (const story of stories) {
      if (story.primary_developer) users.set(story.primary_developer.id, story.primary_developer);
      for (const collaborator of story.collaborators) users.set(collaborator.id, collaborator);
    }
    return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private matches(row: MonitoringRow, query: TaskMonitoringQueryDto) {
    if (query.project_id && row.project?.id !== query.project_id) return false;
    if (query.website_id && row.website?.id !== query.website_id) return false;
    if (query.developer_id && !row.developers.some((developer) => developer.id === query.developer_id)) return false;
    if (query.status && row.status !== query.status) return false;
    if (query.priority && row.priority !== query.priority) return false;
    if (query.overdue !== undefined && row.is_overdue !== query.overdue) return false;
    if (query.needs_action !== undefined && row.needs_action !== query.needs_action) return false;
    if (query.search?.trim()) {
      const haystack = [row.title, row.summary, row.project?.name, row.website?.name, row.website?.domain]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      if (!haystack.includes(query.search.trim().toLocaleLowerCase())) return false;
    }
    return true;
  }

  private summarize(rows: MonitoringRow[]) {
    return rows.reduce((summary, row) => {
      summary.total += 1;
      summary[row.status] += 1;
      if (row.is_overdue) summary.overdue += 1;
      if (row.needs_action) summary.needs_action += 1;
      return summary;
    }, { total: 0, needs_action: 0, new: 0, in_progress: 0, waiting_pic: 0, blocked: 0, overdue: 0, done: 0 });
  }

  private toDto(row: MonitoringRow, user: AuthUser, detail = false) {
    return {
      id: row.id,
      source: row.source,
      source_id: row.source_id,
      title: row.title,
      summary: row.summary,
      project: row.project,
      website: row.website,
      status: row.status,
      status_reason: row.status_reason,
      priority: row.priority,
      pic_developer: row.pic_developer,
      developers: row.developers,
      due_date: row.due_date,
      last_update: row.last_update,
      is_overdue: row.is_overdue,
      needs_action: row.needs_action,
      story_count: row.stories.length,
      stories: detail && user.role !== UserRole.pic_web && user.role !== UserRole.superadmin ? row.stories : [],
      business: row.task,
    };
  }

  private userDto(user: { id: string; name: string; email: string; role?: string | UserRole; isActive?: boolean }) {
    return { id: user.id, name: user.name, email: user.email, role: String(user.role ?? UserRole.developer) };
  }

  private minDate(dates: Array<Date | null | undefined>) {
    const valid = dates.filter((date): date is Date => Boolean(date));
    return valid.length ? new Date(Math.min(...valid.map((date) => date.getTime()))) : null;
  }

  private assertCanView(user: AuthUser) {
    const allowedRoles = [UserRole.superadmin, UserRole.bos_it, UserRole.pic_web, UserRole.developer] as string[];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException("Task Monitoring is not available for this role");
    }
  }
}
