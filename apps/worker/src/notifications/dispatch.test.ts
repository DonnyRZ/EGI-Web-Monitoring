import assert from "node:assert/strict";
import test, { before, mock } from "node:test";
import { NotificationChannel, NotificationStatus } from "@egi/database";
import type { dispatchNotification as DispatchNotificationFn } from "./dispatch";

const sendEmailCalls: Array<Record<string, unknown>> = [];

mock.module("./email", {
  namedExports: {
    sendEmail: async (options: Record<string, unknown>) => {
      sendEmailCalls.push(options);
    },
    EmailConfigError: class EmailConfigError extends Error {},
  },
});

let dispatchNotification: typeof DispatchNotificationFn;

before(async () => {
  ({ dispatchNotification } = await import("./dispatch"));
});

function fakePrisma(notification: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    prisma: {
      notification: {
        findUnique: async () => notification,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { ...notification, ...data };
        },
      },
    },
    updates,
  };
}

test("dispatchNotification forwards ccEmails to sendEmail", async () => {
  sendEmailCalls.length = 0;
  const { prisma } = fakePrisma({
    id: "n1",
    channel: NotificationChannel.email,
    status: NotificationStatus.pending,
    title: "Tiket baru",
    message: "Isi tiket",
    ccEmails: ["boss1@example.test", "boss2@example.test"],
    user: { email: "dev@example.test" },
  });

  await dispatchNotification(prisma as never, "n1");

  assert.equal(sendEmailCalls.length, 1);
  assert.equal(sendEmailCalls[0]?.to, "dev@example.test");
  assert.deepEqual(sendEmailCalls[0]?.cc, ["boss1@example.test", "boss2@example.test"]);
});

test("dispatchNotification omits cc when ccEmails is empty", async () => {
  sendEmailCalls.length = 0;
  const { prisma } = fakePrisma({
    id: "n2",
    channel: NotificationChannel.email,
    status: NotificationStatus.pending,
    title: "Tiket baru",
    message: "Isi tiket",
    ccEmails: [],
    user: { email: "dev@example.test" },
  });

  await dispatchNotification(prisma as never, "n2");

  assert.equal(sendEmailCalls.length, 1);
  assert.equal(sendEmailCalls[0]?.cc, undefined);
});
