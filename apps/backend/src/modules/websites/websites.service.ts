import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toWebsiteDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { CreateWebsiteDto, UpdateWebsiteDto, WebsitesQueryDto } from "./websites.dto";

@Injectable()
export class WebsitesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationQueryDto, filters: WebsitesQueryDto) {
    const where: Prisma.WebsiteWhereInput = {};
    if (filters.is_active !== undefined) where.isActive = filters.is_active;

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

  async get(id: string) {
    const website = await this.prisma.website.findUnique({ where: { id } });
    if (!website) throw new NotFoundException("Website not found");
    return toWebsiteDto(website);
  }

  async update(id: string, dto: UpdateWebsiteDto) {
    await this.get(id);
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
    await this.get(id);
    await this.prisma.website.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
