import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@egi/database";
import { TasksService } from "./tasks.service";
import type { AuthUser } from "../../common/current-user.decorator";

test("PIC Web legacy-task listing stays scoped to owned websites", async () => {
  const picWeb: AuthUser = { id: "pic-1", email: "pic@example.test", role: UserRole.pic_web };
  let capturedWhere: Record<string, unknown> | undefined;
  const prisma = {
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    task: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return 0;
      },
      findMany: async () => [],
    },
  };
  const service = new TasksService(prisma as never);

  const result = await service.list(
    { page: 1, limit: 20 },
    { page: 1, limit: 20 },
    picWeb,
  );

  assert.deepEqual(capturedWhere?.website, { ownerId: picWeb.id });
  assert.deepEqual(result.data, []);
});

test("developer legacy-task listing stays scoped to the authenticated assignee", async () => {
  const developer: AuthUser = { id: "dev-1", email: "dev@example.test", role: UserRole.developer };
  let capturedWhere: Record<string, unknown> | undefined;
  const prisma = {
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    task: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return 0;
      },
      findMany: async () => [],
    },
  };
  const service = new TasksService(prisma as never);

  await service.list(
    { page: 1, limit: 20 },
    { page: 1, limit: 20 },
    developer,
  );

  assert.equal(capturedWhere?.assigneeId, developer.id);
});
