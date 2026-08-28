import assert from "node:assert/strict";
import test from "node:test";
import { ProjectRequestStatus, ProjectStatus, UserRole } from "@egi/database";
import type { AuthUser } from "../../common/current-user.decorator";
import { ProjectRequestsService } from "./project-requests.service";

const picWeb: AuthUser = { id: "pic-1", email: "pic@example.test", role: UserRole.pic_web };
const otherPicWeb: AuthUser = { id: "pic-2", email: "other@example.test", role: UserRole.pic_web };
const bosIt: AuthUser = { id: "bos-1", email: "bos@example.test", role: UserRole.bos_it };
const developer: AuthUser = { id: "dev-1", email: "dev@example.test", role: UserRole.developer };

function makeRecord(overrides: Record<string, unknown> = {}) {
  const submittedBy = { id: "pic-1", name: "PIC Web", email: picWeb.email, role: UserRole.pic_web, isActive: true };
  const reviewer = { id: "bos-1", name: "Bos IT", email: bosIt.email, role: UserRole.bos_it, isActive: true };
  return {
    id: "request-1",
    requestNumber: "PRJ-20260828-1530-000001",
    requestedName: "Portal HR",
    briefing: "Kebutuhan portal internal",
    expectedOutcome: "Data tersedia dalam satu portal",
    proposedWebsiteName: null,
    proposedDomain: null,
    attachmentUrl: null,
    status: ProjectRequestStatus.pending,
    submittedById: picWeb.id,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    projectId: null,
    createdAt: new Date("2026-08-28T10:00:00.000Z"),
    updatedAt: new Date("2026-08-28T10:00:00.000Z"),
    submittedBy,
    reviewedBy: null,
    project: null,
    ...overrides,
  };
}

function makeService(initial = makeRecord()) {
  let request = initial;
  let project: { id: string; name: string; status: ProjectStatus } | null = null;
  const projectCreates: Array<Record<string, unknown>> = [];
  const requestUpdates: Array<Record<string, unknown>> = [];
  const listWheres: Array<Record<string, unknown>> = [];

  const prisma = {
    projectRequest: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        listWheres.push(where);
        return 1;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        listWheres.push(where);
        return [request];
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.submittedById && where.submittedById !== request.submittedById) return null;
        return request;
      },
      findUnique: async () => request,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        request = makeRecord({
          ...request,
          ...data,
          status: ProjectRequestStatus.pending,
          submittedById: data.submittedById,
          submittedBy: { id: data.submittedById, name: "PIC Web", email: picWeb.email, role: UserRole.pic_web, isActive: true },
        });
        return request;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        requestUpdates.push(data);
        request = makeRecord({
          ...request,
          ...data,
          project: data.projectId ? project : request.project,
          reviewedBy: data.reviewedById ? { id: bosIt.id, name: "Bos IT", email: bosIt.email, role: UserRole.bos_it, isActive: true } : request.reviewedBy,
        });
        return request;
      },
    },
    project: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        project = { id: "project-1", name: String(data.name), status: ProjectStatus.draft };
        projectCreates.push(data);
        return project;
      },
    },
  };
  const prismaWithTransaction = {
    ...prisma,
    $transaction: async (operation: unknown) => {
      if (typeof operation === "function") return operation(prismaWithTransaction);
      return Promise.all(operation as Array<Promise<unknown>>);
    },
  };
  return {
    service: new ProjectRequestsService(prismaWithTransaction as never),
    projectCreates,
    requestUpdates,
    listWheres,
    get project() { return project; },
  };
}

test("PIC Web can submit a trimmed Project request without creating Project work", async () => {
  const { service, projectCreates, requestUpdates } = makeService();

  const result = await service.create({
    requested_name: "  Portal HR  ",
    briefing: "  Kebutuhan portal internal  ",
    expected_outcome: "  Data tersedia  ",
    proposed_domain: "hr.example.com",
  }, picWeb);

  assert.equal(result.status, ProjectRequestStatus.pending);
  assert.equal(result.requested_name, "Portal HR");
  assert.equal(result.briefing, "Kebutuhan portal internal");
  assert.equal(result.proposed_domain, "hr.example.com");
  assert.equal(projectCreates.length, 0);
  assert.equal(requestUpdates.length, 0);
});

test("Project request visibility is scoped to the submitting PIC Web", async () => {
  const { service, listWheres } = makeService();
  await service.list({ page: 1, limit: 25 }, picWeb);
  assert.equal(listWheres[0]?.submittedById, picWeb.id);

  await assert.rejects(() => service.list({ page: 1, limit: 25 }, developer), /tidak memiliki akses/i);
});

test("IT review actions require a note and can request more information", async () => {
  const { service, requestUpdates } = makeService();

  await assert.rejects(() => service.requestInfo("request-1", { note: "   " }, bosIt), /Catatan kelengkapan wajib/i);
  const result = await service.requestInfo("request-1", { note: "Mohon tambahkan target pengguna." }, bosIt);

  assert.equal(result.status, ProjectRequestStatus.needs_info);
  assert.equal(result.review_note, "Mohon tambahkan target pengguna.");
  assert.equal(requestUpdates.length, 1);
});

test("PIC Web can update only a needs-info request and it returns to pending", async () => {
  const { service } = makeService(makeRecord({ status: ProjectRequestStatus.needs_info, reviewNote: "Tambahkan hasil." }));

  const result = await service.update("request-1", {
    requested_name: "Portal HR 2",
    briefing: "Brief baru",
    expected_outcome: "Hasil baru",
  }, picWeb);

  assert.equal(result.status, ProjectRequestStatus.pending);
  assert.equal(result.requested_name, "Portal HR 2");
  assert.equal(result.review_note, "Tambahkan hasil.");
  await assert.rejects(() => service.update("request-1", { briefing: "Tidak boleh" }, otherPicWeb), /tidak ditemukan/i);
});

test("Approval atomically creates one Project Draft and retries are idempotent", async () => {
  const { service, projectCreates } = makeService();

  const first = await service.approve("request-1", { name: "  Portal HR Final  ", description: "Deskripsi final" }, bosIt);
  assert.equal(first.project.name, "Portal HR Final");
  assert.equal(first.project.status, ProjectStatus.draft);
  assert.equal(projectCreates.length, 1);

  const second = await service.approve("request-1", { name: "Nama berbeda" }, bosIt);
  assert.equal(second.project.id, first.project.id);
  assert.equal(projectCreates.length, 1);
});

test("Invalid proposed domains are rejected before persistence", async () => {
  const { service } = makeService();
  await assert.rejects(() => service.create({
    requested_name: "Project",
    briefing: "Brief",
    expected_outcome: "Hasil",
    proposed_domain: "not a domain",
  }, picWeb), /Domain website tidak valid/i);
});
