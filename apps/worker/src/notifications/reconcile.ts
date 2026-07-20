import { NotificationChannel, NotificationStatus, PrismaClient } from "@egi/database";

export async function reconcilePendingNotifications(
  prisma: PrismaClient,
  enqueue: (notificationId: string) => Promise<void>,
  limit = 100,
): Promise<number> {
  const notifications = await prisma.notification.findMany({
    where: {
      status: NotificationStatus.pending,
      channel: { in: [NotificationChannel.email, NotificationChannel.telegram] },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const notification of notifications) {
    await enqueue(notification.id);
  }

  return notifications.length;
}
