import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { hashPassword } from "../../common/crypto";
import { paginatedMeta, toUserDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { CreateUserDto, UpdateUserDto, UsersQueryDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationQueryDto, filters: UsersQueryDto) {
    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role;
    if (filters.is_active !== undefined) where.isActive = filters.is_active;

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      data: users.map(toUserDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
    };
  }

  async create(dto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: hashPassword(dto.password),
          role: dto.role,
          telegramChatId: dto.telegram_chat_id,
        },
      });
      return toUserDto(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Email already exists");
      }
      throw error;
    }
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    return toUserDto(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.get(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role as UserRole | undefined,
        telegramChatId: dto.telegram_chat_id,
        isActive: dto.is_active,
        passwordHash: dto.password ? hashPassword(dto.password) : undefined,
      },
    });
    return toUserDto(user);
  }
}
