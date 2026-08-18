import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toWebsiteDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { assertSafeMonitoringUrl } from "../../common/monitoring-url";
import { canAccessAllMonitoredResources, websiteVisibilityScope } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";
import { CreateWebsiteDto, UpdateWebsiteDto, WebsitesQueryDto } from "./websites.dto";

@Injectable()
export class WebsitesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationQueryDto, filters: WebsitesQueryDto, user: AuthUser) {
    const where: Prisma.WebsiteWhereInput = {};
    if (filters.is_active !== undefined) where.isActive = filters.is_active;
    if (user.role === "pic_web" || user.role === "developer") {
      Object.assign(where, websiteVisibilityScope(user));
    } else if (!canAccessAllMonitoredResources(user)) {
      // Keep the legacy end-user website lookup compatible with the public
      // gallery while Project pages remain unavailable to end users.
      where.ownerId = user.id;
    }

    const [total, websites] = await this.prisma.$transaction([
      this.prisma.website.count({ where }),
      this.prisma.website.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      data: websites.map(toWebsiteDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async create(dto: CreateWebsiteDto) {
    await assertSafeMonitoringUrl(dto.url);
    await this.assertOwnerExists(dto.owner_id);
    await this.assertDeveloperExists(dto.it_pic_id);
    await this.assertDeveloperExists(dto.backup_it_pic_id);
    if (dto.project_id) await this.assertProjectExists(dto.project_id);
    const website = await this.prisma.website.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        url: dto.url,
        projectId: dto.project_id,
        ownerId: dto.owner_id,
        itPicId: dto.it_pic_id,
        backupItPicId: dto.backup_it_pic_id,
        monitoringIntervalMinutes: dto.monitoring_interval_minutes ?? 5,
        isActive: dto.is_active ?? true,
      },
    });
    return toWebsiteDto(website);
  }

  async get(id: string, user: AuthUser) {
    const where: Prisma.WebsiteWhereInput = {
      id,
      ...(user.role === "pic_web" || user.role === "developer"
        ? websiteVisibilityScope(user)
        : canAccessAllMonitoredResources(user)
          ? {}
          : { ownerId: user.id }),
    };
    const website = await this.prisma.website.findFirst({ where });
    if (!website) throw new NotFoundException("Website not found");
    return toWebsiteDto(website);
  }

  async update(id: string, dto: UpdateWebsiteDto) {
    await this.requireExisting(id);
    if (dto.url !== undefined) await assertSafeMonitoringUrl(dto.url);
    await this.assertOwnerExists(dto.owner_id);
    await this.assertDeveloperExists(dto.it_pic_id);
    await this.assertDeveloperExists(dto.backup_it_pic_id);
    const website = await this.prisma.website.update({
      where: { id },
      data: {
        name: dto.name,
        domain: dto.domain,
        url: dto.url,
        ownerId: dto.owner_id,
        itPicId: dto.it_pic_id,
        backupItPicId: dto.backup_it_pic_id,
        monitoringIntervalMinutes: dto.monitoring_interval_minutes,
        isActive: dto.is_active,
      },
    });
    return toWebsiteDto(website);
  }

  async deactivate(id: string) {
    await this.requireExisting(id);
    await this.prisma.website.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async requireExisting(id: string) {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) throw new NotFoundException("Website not found");
    return website;
  }

  private async assertDeveloperExists(userId: string | null | undefined) {
    if (userId === undefined || userId === null) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Developer assignment user not found");
    if (user.role !== UserRole.developer || !user.isActive) {
      throw new NotFoundException("Assignment must target an active developer");
    }
  }

  private async assertOwnerExists(ownerId: string | null | undefined) {
    if (ownerId === undefined || ownerId === null) return;
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) throw new NotFoundException("Website owner not found");
    if (owner.role !== UserRole.pic_web || !owner.isActive) {
      throw new NotFoundException("Website owner must be an active PIC Web");
    }
  }

  private async assertProjectExists(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException("Project not found");
  }
}
