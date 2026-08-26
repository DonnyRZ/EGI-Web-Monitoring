import assert from "node:assert/strict";
import test from "node:test";
import { IncidentStatus, MonitoringStatus, UserRole } from "@egi/database";
import { DashboardService } from "./dashboard.service";
import type { AuthUser } from "../../common/current-user.decorator";

const now = new Date("2026-08-13T12:00:00.000Z");
const developer: AuthUser = { id: "dev-1", email: "dev@example.test", role: UserRole.developer };
const endUser: AuthUser = { id: "owner-1", email: "owner@example.test", role: UserRole.end_user };

function website(id: string, name: string) {
  return {
    id,
    name,
    domain: `${name.toLowerCase()}.example.com`,
    url: `https://${name.toLowerCase()}.example.com`,
    ownerId: endUser.id,
    itPicId: developer.id,
    backupItPicId: null,
    monitoringIntervalMinutes: 5,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function latestResult(websiteId: string, status: MonitoringStatus) {
  return {
    id: `result-${websiteId}`,
    websiteId,
    scheduledAt: now,
    checkedAt: now,
    status,
    httpStatus: status === MonitoringStatus.down ? 503 : 200,
    responseTimeMs: 100,
    errorMessage: status === MonitoringStatus.down ? "HTTP 503" : null,
    createdAt: now,
  };
}

function incident(websiteId: string) {
  return {
    id: `inc-${websiteId}`,
    websiteId,
    title: "Outage",
    severity: "high",
    status: IncidentStatus.open,
    startedAt: now,
    resolvedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const SITE_OK = "11111111-1111-4111-8111-111111111111";
const SITE_DOWN = "22222222-2222-4222-8222-222222222222";
const SITE_WARN = "33333333-3333-4333-8333-333333333333";

function makeFakePrisma(options?: {
  websites?: Array<ReturnType<typeof website>>;
  latestResults?: Array<ReturnType<typeof latestResult>>;
  incidents?: Array<ReturnType<typeof incident>>;
}) {
  const calls: Array<{ method: string; args: unknown }> = [];
  const websites = options?.websites ?? [
    website(SITE_OK, "Alpha"),
    website(SITE_DOWN, "Bravo"),
    website(SITE_WARN, "Charlie"),
  ];
  const latestResults = options?.latestResults ?? [
    latestResult(SITE_OK, MonitoringStatus.normal),
    latestResult(SITE_DOWN, MonitoringStatus.down),
    latestResult(SITE_WARN, MonitoringStatus.warning),
  ];
  const incidents = options?.incidents ?? [incident(SITE_DOWN)];

  const prisma = {
    website: {
      findMany: async (args: unknown) => {
        calls.push({ method: "website.findMany", args });
        return websites;
      },
    },
    incident: {
      findMany: async (args: unknown) => {
        calls.push({ method: "incident.findMany", args });
        return incidents;
      },
    },
    $queryRaw: async (...args: unknown[]) => {
      calls.push({ method: "$queryRaw", args });
      return latestResults;
    },
  };

  return { prisma, calls };
}

test("dashboard list uses batched health queries without nested monitoring include", async () => {
  const { prisma, calls } = makeFakePrisma();
  const service = new DashboardService(prisma as never);

  await service.main(developer);

  const websiteCall = calls.find((c) => c.method === "website.findMany");
  assert.ok(websiteCall);
  const websiteArgs = websiteCall.args as { include?: unknown; where?: unknown };
  assert.equal(websiteArgs.include, undefined);
  assert.deepEqual(websiteArgs.where, { isActive: true });

  assert.ok(calls.some((c) => c.method === "$queryRaw"));
  assert.ok(calls.some((c) => c.method === "incident.findMany"));
});

test("dashboard health response contains no visual evidence fields", async () => {
  const { prisma } = makeFakePrisma();
  const service = new DashboardService(prisma as never);

  const { data } = await service.main(developer);
  const alpha = data.find((card) => card.website.id === SITE_OK);

  assert.ok(alpha?.latest_result);
  assert.ok(alpha?.latest_result && "http_status" in alpha.latest_result);
  if (alpha?.latest_result && "http_status" in alpha.latest_result) {
    assert.equal(alpha.latest_result.http_status, 200);
    assert.equal("screenshot_url" in alpha.latest_result, false);
    assert.equal("render_time_ms" in alpha.latest_result, false);
  }
});

test("status=active omits down cards", async () => {
  const { prisma } = makeFakePrisma();
  const service = new DashboardService(prisma as never);

  const { data } = await service.main(developer, "active");
  const ids = data.map((card) => card.website.id);

  assert.deepEqual(ids.sort(), [SITE_OK, SITE_WARN].sort());
  assert.ok(data.every((card) => card.latest_result?.status !== MonitoringStatus.down));
});

test("status=down returns only down cards", async () => {
  const { prisma } = makeFakePrisma();
  const service = new DashboardService(prisma as never);

  const { data } = await service.main(developer, "down");

  assert.equal(data.length, 1);
  assert.equal(data[0]?.website.id, SITE_DOWN);
  assert.equal(data[0]?.latest_result?.status, MonitoringStatus.down);
  assert.equal(data[0]?.active_incident?.id, `inc-${SITE_DOWN}`);
});

test("omitted status returns every active website for developer my-tasks", async () => {
  const { prisma } = makeFakePrisma();
  const service = new DashboardService(prisma as never);

  const { data } = await service.main(developer);

  assert.equal(data.length, 3);
});

test("end-user gallery still hides down and unknown after health mapping", async () => {
  const unknownSite = "44444444-4444-4444-8444-444444444444";
  const { prisma, calls } = makeFakePrisma({
    websites: [website(SITE_OK, "Alpha"), website(SITE_DOWN, "Bravo"), website(unknownSite, "Delta")],
    latestResults: [
      latestResult(SITE_OK, MonitoringStatus.normal),
      latestResult(SITE_DOWN, MonitoringStatus.down),
      latestResult(unknownSite, MonitoringStatus.unknown),
    ],
    incidents: [],
  });
  const service = new DashboardService(prisma as never);

  const { data } = await service.main(endUser);
  const publicCard = data[0];

  assert.deepEqual(data.map((card) => card.website.id), [SITE_OK]);
  assert.ok(publicCard);
  assert.equal("owner_id" in publicCard.website, false);
  assert.equal("project_id" in publicCard.website, false);
  assert.equal("http_status" in (publicCard.latest_result ?? {}), false);
  assert.equal(publicCard.active_incident, null);
  assert.ok(!calls.some((c) => c.method === "incident.findMany"));
});

test("skips latest-result and incident queries when there are no websites", async () => {
  const { prisma, calls } = makeFakePrisma({ websites: [], latestResults: [], incidents: [] });
  const service = new DashboardService(prisma as never);

  const { data } = await service.main(developer);

  assert.deepEqual(data, []);
  assert.ok(!calls.some((c) => c.method === "$queryRaw"));
  assert.ok(!calls.some((c) => c.method === "incident.findMany"));
});
