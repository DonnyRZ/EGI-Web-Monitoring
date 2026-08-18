import assert from "node:assert/strict";
import test from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";

function controllerWith(queryRaw: () => Promise<unknown>) {
  return new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);
}

test("health endpoint remains a liveness check", () => {
  assert.deepEqual(controllerWith(async () => []).check(), { status: "ok" });
});

test("readiness endpoint checks the database", async () => {
  let calls = 0;
  const controller = controllerWith(async () => {
    calls += 1;
    return [];
  });

  assert.deepEqual(await controller.ready(), { status: "ready" });
  assert.equal(calls, 1);
});

test("readiness endpoint returns a service-unavailable error when the database is down", async () => {
  const controller = controllerWith(async () => {
    throw new Error("connection refused");
  });

  await assert.rejects(controller.ready(), (error: unknown) => {
    return error instanceof ServiceUnavailableException && error.getStatus() === 503;
  });
});
