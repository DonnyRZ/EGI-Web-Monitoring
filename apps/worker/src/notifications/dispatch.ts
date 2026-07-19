import {
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
} from "@egi/database";
import { log } from "../log";
import { sendEmail, EmailConfigError } from "./email";
import {
  sendTelegramWithBackoff,
  TelegramApiError,
  TelegramConfigError,
} from "./telegram";

const MAX_CHANNEL_ATTEMPTS = 3;

/**
 * Process a pending notification row.
 * Monitoring pipeline must never fail because of notification errors.
 */
export async function dispatchNotification(
  prisma: PrismaClient,
  notificationId: string,
): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: true },
  });

  if (!notification) {
    log("notification_missing", { notification_id: notificationId });
    return;
  }

  if (notification.status === NotificationStatus.sent) {
    return;
  }

  if (notification.channel === NotificationChannel.dashboard) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.sent,
        sentAt: notification.sentAt ?? new Date(),
        errorMessage: null,
      },
    });
    return;
  }

  try {
    if (notification.channel === NotificationChannel.email) {
      const email = notification.user?.email;
      if (!email) {
        throw new EmailConfigError("Notification has no user email");
      }
      await sendEmail({
        to: email,
        subject: notification.title,
        text: notification.message,
      });
    } else if (notification.channel === NotificationChannel.telegram) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
      const groupChatId = process.env.TELEGRAM_CHAT_ID || "";
      const userChatId = notification.user?.telegramChatId || "";
      const chatId = userChatId || groupChatId;

      if (!botToken.trim()) {
        throw new TelegramConfigError(
          "TELEGRAM_BOT_TOKEN is empty; Telegram send skipped",
        );
      }
      if (!chatId.trim()) {
        throw new TelegramConfigError(
          "No telegram chat_id (user.telegram_chat_id or TELEGRAM_CHAT_ID)",
        );
      }

      await sendTelegramWithBackoff({
        botToken,
        chatId,
        title: notification.title,
        message: notification.message,
      });
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.sent,
        sentAt: new Date(),
        errorMessage: null,
      },
    });
    log("notification_sent", {
      notification_id: notificationId,
      channel: notification.channel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Config missing → fail immediately (do not burn retries pretending success)
    const isConfig =
      error instanceof TelegramConfigError || error instanceof EmailConfigError;

    const attemptsMeta = await getAttemptHint(error);
    log("notification_send_failed", {
      notification_id: notificationId,
      channel: notification.channel,
      error: message,
      ...attemptsMeta,
    });

    if (isConfig) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.failed,
          errorMessage: message.slice(0, 2000),
        },
      });
      return;
    }

    // Let BullMQ retry transient failures; mark failed on final attempt via caller
    throw error;
  }
}

export async function markNotificationFailed(
  prisma: PrismaClient,
  notificationId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.failed,
      errorMessage: errorMessage.slice(0, 2000),
    },
  });
}

function getAttemptHint(error: unknown): Record<string, unknown> {
  if (error instanceof TelegramApiError && error.retryAfterSec) {
    return { telegram_retry_after_sec: error.retryAfterSec };
  }
  return { max_attempts: MAX_CHANNEL_ATTEMPTS };
}
