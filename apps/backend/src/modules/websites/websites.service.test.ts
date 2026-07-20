import assert from "node:assert/strict";
import test from "node:test";
import { WebsitesService } from "./websites.service";

const owner = { id: "owner-1", email: "owner@example.test", role: "business_owner" };
const ops = { id: "ops-1", email: "ops@example.test", role: "it_ops" };

function makeService() {
  const calls: Array<{ method: string; args: unknown }> = [];
  const website = {
    id: "site-1", name: "Site", domain: "example.com", url: "https://example.com",
    ownerId: owner.id, monitoringIntervalMinutes: 5, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const prisma = {
    website: {
      count: (args: unknown) => { calls.push({ method: "count", args }); return Promise.resolve(1); },
      findMany: (args: unknown) => { calls.push({ method: "findMany", args }); return Promise.resolve([website]); },
      findFirst: (args: unknown) => { calls.push({ method: "findFirst", args }); return Promise.resolve(website); },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  return { service: new WebsitesService(prisma as never), calls };
}

test("owners are scoped on website lists while operations see all websites", async () => {
  const ownerFixture = makeService();
  await ownerFixture.service.list({ page: 1, limit: 20 }, { page: 1, limit: 20 }, owner);
  assert.deepEqual(ownerFixture.calls[0]?.args, { where: { ownerId: owner.id } });

  const opsFixture = makeService();
  await opsFixture.service.list({ page: 1, limit: 20 }, { page: 1, limit: 20 }, ops);
  assert.deepEqual(opsFixture.calls[0]?.args, { where: {} });
});

test("website detail lookup cannot enumerate another owner's resource", async () => {
  const fixture = makeService();
  await fixture.service.get("site-1", owner);
  assert.deepEqual(fixture.calls[0]?.args, { where: { id: "site-1", ownerId: owner.id } });
});
