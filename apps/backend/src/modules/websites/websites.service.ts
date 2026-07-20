import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toWebsiteDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { assertSafeMonitoringUrl } from "../../common/monitoring-url";
import { canAccessAllMonitoredResources } from "../../common/resource-access";
import type { AuthUser } from "../../common/current-user.decorator";
import { CreateWebsiteDto, UpdateWebsiteDto, WebsitesQueryDto } from "./websites.dto";

@Injectable()
export class WebsitesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationQueryDto, filters: WebsitesQueryDto, user: AuthUser) {
    const where: Prisma.WebsiteWhereInput = {};
    if (filters.is_active !== undefined) where.isActive = filters.is_active;
    if (!canAccessAllMonitoredResources(user)) where.ownerId = user.id;

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
    const website = await this.prisma.website.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        url: dto.url,
        ownerId: dto.owner_id,
        monitoringIntervalMinutes: dto.monitoring_interval_minutes ?? 5,
        isActive: dto.is_active ?? true,
      },
    });
    return toWebsiteDto(website);
  }

  async get(id: string, user: AuthUser) {
    const where: Prisma.WebsiteWhereInput = {
      id,
      ...(canAccessAllMonitoredResources(user) ? {} : { ownerId: user.id }),
    };
    const website = await this.prisma.website.findFirst({ where });
    if (!website) throw new NotFoundException("Website not found");
    return toWebsiteDto(website);
  }

  async update(id: string, dto: UpdateWebsiteDto) {
    await this.requireExisting(id);
    if (dto.url !== undefined) await assertSafeMonitoringUrl(dto.url);
    await this.assertOwnerExists(dto.owner_id);
    const website = await this.prisma.website.update({
      where: { id },
      data: {
        name: dto.name,
        domain: dto.domain,
        url: dto.url,
        ownerId: dto.owner_id,
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

  private async assertOwnerExists(ownerId: string | null | undefined) {
    if (ownerId === undefined || ownerId === null) return;
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) throw new NotFoundException("Website owner not found");
  }
}
