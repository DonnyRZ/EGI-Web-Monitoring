import assert from "node:assert/strict";
import test, { before, mock } from "node:test";
import type { sendEmail as SendEmailFn, EmailConfigError as EmailConfigErrorClass } from "./email";

const sendMailCalls: Array<Record<string, unknown>> = [];

mock.module("nodemailer", {
  defaultExport: {
    createTransport: () => ({
      sendMail: async (options: Record<string, unknown>) => {
        sendMailCalls.push(options);
      },
    }),
  },
});

let sendEmail: typeof SendEmailFn;
let EmailConfigError: typeof EmailConfigErrorClass;

before(async () => {
  ({ sendEmail, EmailConfigError } = await import("./email"));
});

test("sendEmail throws EmailConfigError when SMTP_HOST is empty", async () => {
  const previous = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  try {
    await assert.rejects(
      () => sendEmail({ to: "dev@example.test", subject: "x", text: "y" }),
      EmailConfigError,
    );
  } finally {
    if (previous !== undefined) process.env.SMTP_HOST = previous;
  }
});

test("sendEmail forwards cc addresses to the transporter", async () => {
  process.env.SMTP_HOST = "smtp.example.test";
  sendMailCalls.length = 0;

  await sendEmail({
    to: "dev@example.test",
    cc: ["boss1@example.test", "boss2@example.test"],
    subject: "Tiket baru",
    text: "Isi tiket",
  });

  assert.equal(sendMailCalls.length, 1);
  assert.equal(sendMailCalls[0]?.to, "dev@example.test");
  assert.deepEqual(sendMailCalls[0]?.cc, ["boss1@example.test", "boss2@example.test"]);
});

test("sendEmail omits cc when the list is empty", async () => {
  process.env.SMTP_HOST = "smtp.example.test";
  sendMailCalls.length = 0;

  await sendEmail({ to: "dev@example.test", cc: [], subject: "Tiket baru", text: "Isi tiket" });

  assert.equal(sendMailCalls.length, 1);
  assert.equal(sendMailCalls[0]?.cc, undefined);
});
