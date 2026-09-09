import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@egi/database";
import { UserStoryStatusGroup } from "@egi/shared-types";
import type { AuthUser } from "../../common/current-user.decorator";
import { UserStoriesService } from "./user-stories.service";

const bosIt: AuthUser = { id: "bos-1", email: "bos@example.test", role: UserRole.bos_it };

function makeService() {
  const calls: Array<{ where: unknown }> = [];
  const prisma = {
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    userStory: {
      count: async (args: { where: unknown }) => {
        calls.push({ where: args.where });
        return 0;
      },
      findMany: async (args: { where: unknown }) => {
        calls.push({ where: args.where });
        return [];
      },
    },
  };
  return { service: new UserStoriesService(prisma as never), calls };
}

test("maps status_group=not_started to Backlog and Ready in the database filter", async () => {
  const { service, calls } = makeService();
  await service.list({ page: 1, limit: 20, status_group: UserStoryStatusGroup.not_started }, { page: 1, limit: 20, status_group: UserStoryStatusGroup.not_started }, bosIt);
  assert.equal(calls.length, 2);
  const firstCall = calls[0];
  assert.ok(firstCall);
  assert.deepEqual((firstCall.where as { AND: Array<{ AND: Array<{ status: unknown }> }> }).AND[0]!.AND[0]!.status, { in: ["backlog", "ready"] });
});

test("maps active, done, and blocked groups without changing exact status support", async () => {
  for (const [group, expected] of [
    [UserStoryStatusGroup.active, { in: ["in_progress", "review"] }],
    [UserStoryStatusGroup.done, { in: ["done"] }],
    [UserStoryStatusGroup.blocked, { in: ["blocked"] }],
  ] as const) {
    const { service, calls } = makeService();
    await service.list({ page: 1, limit: 20, status_group: group }, { page: 1, limit: 20, status_group: group }, bosIt);
    const firstCall = calls[0];
    assert.ok(firstCall);
    assert.deepEqual((firstCall.where as { AND: Array<{ AND: Array<{ status: unknown }> }> }).AND[0]!.AND[0]!.status, expected);
  }

  const { service, calls } = makeService();
  await service.list({ page: 1, limit: 20, status: "review" }, { page: 1, limit: 20, status: "review" }, bosIt);
  const firstCall = calls[0];
  assert.ok(firstCall);
  assert.deepEqual((firstCall.where as { AND: Array<{ AND: Array<{ status: unknown }> }> }).AND[0]!.AND[0]!.status, "review");
});

test("rejects ambiguous exact and grouped status filters", async () => {
  const { service, calls } = makeService();
  await assert.rejects(
    () => service.list({ page: 1, limit: 20, status: "review", status_group: UserStoryStatusGroup.active }, { page: 1, limit: 20, status: "review", status_group: UserStoryStatusGroup.active }, bosIt),
    /either status or status_group/i,
  );
  assert.equal(calls.length, 0);
});
