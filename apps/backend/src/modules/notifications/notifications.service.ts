import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationChannel, Prisma } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { paginatedMeta, toNotificationDto } from "../../common/mappers";
import { PaginationQueryDto } from "../../common/pagination.dto";
import { NotificationsQueryDto } from "./notifications.dto";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, pagination: PaginationQueryDto, filters: NotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: filters.channel ?? NotificationChannel.dashboard,
    };
    if (filters.unread_only) where.readAt = null;

    const [total, unreadCount, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, channel: NotificationChannel.dashboard, readAt: null },
      }),
      this.prisma.notification.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      data: notifications.map(toNotificationDto),
      meta: paginatedMeta(pagination.page, pagination.limit, total),
      unread_count: unreadCount,
    };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException("Notification not found");

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return toNotificationDto(updated);
  }

  async readAll(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        channel: NotificationChannel.dashboard,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
