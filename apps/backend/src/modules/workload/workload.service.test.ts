import assert from "node:assert/strict";
import test from "node:test";
import { TaskStatus, TicketStatus, UserRole } from "@egi/database";
import { WorkloadService } from "./workload.service";
import type { AuthUser } from "../../common/current-user.decorator";

const DEV_A = { id: "dev-a", name: "Donny" };
const DEV_B = { id: "dev-b", name: "Dewa" };
const bosIt: AuthUser = { id: "bos-1", email: "bos@example.test", role: UserRole.bos_it };
const picWeb: AuthUser = { id: "pic-1", email: "pic@example.test", role: UserRole.pic_web };

const HOUR_MS = 3_600_000;
const past = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR_MS);
const future = (hoursAhead: number) => new Date(Date.now() + hoursAhead * HOUR_MS);

function makeFakePrisma(options: {
  orphanTickets: Array<{ assignedTo: string; status: TicketStatus; slaDeadline: Date | null }>;
  tasks: Array<{ assigneeId: string; status: TaskStatus; slaDeadline: Date | null }>;
  developers?: Array<{ id: string; name: string }>;
  picWebsites?: Array<{ id: string; itPicId: string | null; backupItPicId: string | null }>;
}) {
  let capturedTicketWhere: Record<string, unknown> | undefined;
  let capturedTaskWhere: Record<string, unknown> | undefined;
  let capturedUserWhere: Record<string, unknown> | undefined;

  const prisma = {
    website: {
      findMany: async () => options.picWebsites ?? [],
    },
    user: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) => {
        capturedUserWhere = where;
        const all = options.developers ?? [DEV_A, DEV_B];
        const idFilter = where?.id as { in?: string[] } | undefined;
        if (idFilter?.in) return all.filter((d) => idFilter.in?.includes(d.id));
        return all;
      },
    },
    ticket: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedTicketWhere = where;
        return options.orphanTickets;
      },
    },
    task: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) => {
        capturedTaskWhere = where;
        return options.tasks;
      },
    },
  };

  return {
    prisma,
    getCapturedTicketWhere: () => capturedTicketWhere,
    getCapturedTaskWhere: () => capturedTaskWhere,
    getCapturedUserWhere: () => capturedUserWhere,
  };
}

test("only fetches tickets with no linked task, to avoid double-counting the auto-created task", async () => {
  const { prisma, getCapturedTicketWhere } = makeFakePrisma({ orphanTickets: [], tasks: [] });
  const service = new WorkloadService(prisma as never);

  await service.developers(bosIt);

  assert.equal(getCapturedTicketWhere()?.task, null);
});

test("a standalone (orphan) ticket is counted once and flagged via its orphan-ticket sub-count", async () => {
  const { prisma } = makeFakePrisma({
    orphanTickets: [{ assignedTo: DEV_A.id, status: TicketStatus.open, slaDeadline: null }],
    tasks: [],
  });
  const service = new WorkloadService(prisma as never);

  const [rowA] = await service.developers(bosIt);

  assert.ok(rowA);
  assert.equal(rowA.developer_id, DEV_A.id);
  assert.equal(rowA.pending, 1);
  assert.equal(rowA.pending_orphan_tickets, 1);
  assert.equal(rowA.total_active, 1);
});

test("a ticket that already spawned a task contributes only via the task, not the ticket", async () => {
  // Simulates the auto-create pipeline: ticket.findMany (task: null filter) returns
  // nothing for this ticket because it already has a linked task; only the task shows up.
  const { prisma } = makeFakePrisma({
    orphanTickets: [],
    tasks: [{ assigneeId: DEV_A.id, status: TaskStatus.pending, slaDeadline: null }],
  });
  const service = new WorkloadService(prisma as never);

  const [rowA] = await service.developers(bosIt);

  assert.ok(rowA);
  assert.equal(rowA.pending, 1);
  assert.equal(rowA.pending_orphan_tickets, 0);
  assert.equal(rowA.total_active, 1);
});

test("pending/in_progress buckets combine orphan tickets and tasks correctly", async () => {
  const { prisma } = makeFakePrisma({
    orphanTickets: [{ assignedTo: DEV_A.id, status: TicketStatus.in_progress, slaDeadline: null }],
    tasks: [
      { assigneeId: DEV_A.id, status: TaskStatus.pending, slaDeadline: null },
      { assigneeId: DEV_A.id, status: TaskStatus.in_progress, slaDeadline: null },
    ],
  });
  const service = new WorkloadService(prisma as never);

  const [rowA] = await service.developers(bosIt);

  assert.ok(rowA);
  assert.equal(rowA.pending, 1);
  assert.equal(rowA.pending_orphan_tickets, 0);
  assert.equal(rowA.in_progress, 2);
  assert.equal(rowA.in_progress_orphan_tickets, 1);
  assert.equal(rowA.total_active, 3);
});

test("overdue is computed from slaDeadline for both orphan tickets and tasks", async () => {
  const { prisma } = makeFakePrisma({
    orphanTickets: [{ assignedTo: DEV_A.id, status: TicketStatus.open, slaDeadline: past(2) }],
    tasks: [
      { assigneeId: DEV_A.id, status: TaskStatus.in_progress, slaDeadline: past(1) },
      { assigneeId: DEV_A.id, status: TaskStatus.pending, slaDeadline: future(5) },
    ],
  });
  const service = new WorkloadService(prisma as never);

  const [rowA] = await service.developers(bosIt);

  assert.ok(rowA);
  assert.equal(rowA.overdue, 2);
  assert.equal(rowA.overdue_orphan_tickets, 1);
  assert.equal(rowA.total_active, 3);
});

test("sorts by overdue desc, then total_active desc", async () => {
  const { prisma } = makeFakePrisma({
    orphanTickets: [],
    tasks: [
      { assigneeId: DEV_A.id, status: TaskStatus.pending, slaDeadline: null },
      { assigneeId: DEV_B.id, status: TaskStatus.pending, slaDeadline: past(3) },
      { assigneeId: DEV_B.id, status: TaskStatus.in_progress, slaDeadline: null },
    ],
  });
  const service = new WorkloadService(prisma as never);

  const rows = await service.developers(bosIt);

  assert.equal(rows[0]?.developer_id, DEV_B.id);
  assert.equal(rows[0]?.overdue, 1);
  assert.equal(rows[1]?.developer_id, DEV_A.id);
});

test("PIC Web only sees developers who are PIC of their owned websites", async () => {
  const { prisma, getCapturedUserWhere, getCapturedTaskWhere, getCapturedTicketWhere } = makeFakePrisma({
    orphanTickets: [],
    tasks: [],
    picWebsites: [{ id: "web-1", itPicId: DEV_A.id, backupItPicId: null }],
  });
  const service = new WorkloadService(prisma as never);

  const rows = await service.developers(picWeb);

  assert.deepEqual((getCapturedUserWhere()?.id as { in?: string[] })?.in, [DEV_A.id]);
  assert.deepEqual((getCapturedTaskWhere()?.websiteId as { in?: string[] })?.in, ["web-1"]);
  assert.deepEqual((getCapturedTicketWhere()?.websiteId as { in?: string[] })?.in, ["web-1"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.developer_id, DEV_A.id);
});

test("PIC Web with no assigned developers gets an empty workload list", async () => {
  const { prisma } = makeFakePrisma({
    orphanTickets: [],
    tasks: [{ assigneeId: DEV_A.id, status: TaskStatus.pending, slaDeadline: null }],
    picWebsites: [{ id: "web-1", itPicId: null, backupItPicId: null }],
  });
  const service = new WorkloadService(prisma as never);

  const rows = await service.developers(picWeb);
  assert.deepEqual(rows, []);
});

