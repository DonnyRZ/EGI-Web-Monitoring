import assert from "node:assert/strict";
import test from "node:test";
import { ProjectStatus, UserRole } from "@egi/database";
import type { AuthUser } from "../../common/current-user.decorator";
import { ProjectsService } from "./projects.service";

const bosIt: AuthUser = { id: "bos-1", email: "bos@example.test", role: UserRole.bos_it };
const developer: AuthUser = { id: "dev-1", email: "dev@example.test", role: UserRole.developer };

function makeService(options: { status?: ProjectStatus; websites?: Array<{ id: string }> } = {}) {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const prisma = {
    project: {
      findUnique: async () => ({
        id: "project-1",
        name: "Project Test",
        description: "Deskripsi lama",
        status: options.status ?? ProjectStatus.draft,
        websites: options.websites ?? [],
      }),
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push(args);
        return undefined;
      },
      findFirst: async () => null,
    },
  };
  const service = new ProjectsService(prisma as never);
  (service as unknown as { get: ProjectsService["get"] }).get = async (id, user) => ({
    id,
    name: "Project baru",
    description: "Deskripsi baru",
    status: options.status ?? ProjectStatus.draft,
    user_id: user.id,
  }) as never;
  return { service, updates };
}

test("updates Project metadata and lifecycle status for Bos IT", async () => {
  const { service, updates } = makeService({ status: ProjectStatus.draft, websites: [{ id: "website-1" }] });

  await service.update("project-1", {
    name: "  Project Baru  ",
    description: "  Konteks baru  ",
    status: ProjectStatus.active,
  }, bosIt);

  assert.deepEqual(updates, [{
    where: { id: "project-1" },
    data: { name: "Project Baru", description: "Konteks baru", status: ProjectStatus.active },
  }]);
});

test("rejects activating a Project without a Website before writing", async () => {
  const { service, updates } = makeService({ status: ProjectStatus.draft });

  await assert.rejects(
    () => service.update("project-1", { status: ProjectStatus.active }, bosIt),
    /at least one website/i,
  );
  assert.equal(updates.length, 0);
});

test("allows archiving a Project while preserving its existing Website relation", async () => {
  const { service, updates } = makeService({ status: ProjectStatus.active, websites: [{ id: "website-1" }] });

  await service.update("project-1", { status: ProjectStatus.archived }, bosIt);

  assert.equal(updates[0]?.data.status, ProjectStatus.archived);
});

test("rejects a blank Project name after trimming", async () => {
  const { service, updates } = makeService();

  await assert.rejects(
    () => service.update("project-1", { name: "   " }, bosIt),
    /project name is required/i,
  );
  assert.equal(updates.length, 0);
});

test("only Superadmin and Bos IT can update Project settings", async () => {
  const { service, updates } = makeService();

  await assert.rejects(
    () => service.update("project-1", { description: "Tidak boleh" }, developer),
    /only superadmin or bos it/i,
  );
  assert.equal(updates.length, 0);
});
