/**
 * Exhaustive deep API test suite for EGI Website Monitoring NestJS backend.
 *
 * Usage (from repo root, with an isolated test backend + Postgres running):
 *   ALLOW_DESTRUCTIVE_DEEP_TEST=yes \
 *   TEST_DATABASE_URL=postgresql://.../egi_monitoring_test \
 *   API_BASE=http://127.0.0.1:3101/api \
 *   DOCS_URL=http://127.0.0.1:3101/docs \
 *   node apps/backend/scripts/api-deep-test.mjs
 *
 * Env:
 *   ALLOW_DESTRUCTIVE_DEEP_TEST  must be exactly "yes"
 *   API_BASE                     required; must point to the isolated API
 *   DOCS_URL                     required; must point to the isolated API docs
 *   TEST_DATABASE_URL            required; database name must contain "test"
 */

import { randomUUID } from "node:crypto";
import { hashSync } from "bcryptjs";
import { PrismaClient, UserRole, IncidentStatus, Severity, TicketStatus, NotificationChannel, NotificationStatus, MonitoringStatus } from "@egi/database";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertSafeTestEnvironment() {
  if (process.env.ALLOW_DESTRUCTIVE_DEEP_TEST !== "yes") {
    throw new Error(
      "Refusing to run destructive API tests. Set ALLOW_DESTRUCTIVE_DEEP_TEST=yes only for an isolated test environment.",
    );
  }

  const databaseUrl = requiredEnv("TEST_DATABASE_URL");
  let databaseName;
  try {
    databaseName = new URL(databaseUrl).pathname.replace(/^\//, "").toLowerCase();
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (!databaseName.includes("test")) {
    throw new Error(
      `Refusing TEST_DATABASE_URL for database "${databaseName}". The database name must contain "test".`,
    );
  }

  return databaseUrl;
}

const TEST_DATABASE_URL = assertSafeTestEnvironment();
const API = requiredEnv("API_BASE").replace(/\/$/, "");
const DOCS = requiredEnv("DOCS_URL");
const PASSWORD = "Admin123!";
const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

const results = [];
let passed = 0;
let failed = 0;

function hashPassword(password) {
  return hashSync(password, 10);
}

function ok(name, detail = "") {
  passed += 1;
  results.push({ ok: true, name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  failed += 1;
  results.push({ ok: false, name, detail });
  console.error(`  ✗ ${name} — ${detail}`);
}

async function req(method, path, { token, cookie, body, expectStatus, headers } = {}) {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const h = { ...(headers ?? {}) };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  if (cookie) h.Cookie = cookie;

  const res = await fetch(url, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (expectStatus !== undefined) {
    const expected = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
    if (!expected.includes(res.status)) {
      const err = new Error(
        `Expected ${expected.join("|")}, got ${res.status}: ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data)?.slice(0, 300)}`,
      );
      err.status = res.status;
      err.data = data;
      throw err;
    }
  }

  return { status: res.status, data, headers: res.headers };
}

function refreshCookie(headers) {
  const setCookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean);
  const line = setCookies.find((value) => value.startsWith("egi_refresh_token="));
  return line?.split(";", 1)[0] ?? null;
}

async function assert(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(name, e.message ?? String(e));
  }
}

async function login(email, password = PASSWORD) {
  const { data, headers } = await req("POST", "/auth/login", {
    body: { email, password },
    expectStatus: 200,
  });
  const cookie = refreshCookie(headers);
  if (!cookie) throw new Error("login did not set refresh cookie");
  if ("refresh_token" in data) throw new Error("login leaked refresh token in JSON");
  return { ...data, refresh_cookie: cookie };
}

function assertSnakeUser(u) {
  for (const k of ["telegram_chat_id", "email_verified_at", "is_active", "created_at", "updated_at"]) {
    if (!(k in u)) throw new Error(`missing field ${k}`);
  }
  if ("passwordHash" in u || "password_hash" in u) throw new Error("password hash leaked");
}

async function ensureRoleUsers(adminToken) {
  const roles = ["end_user", "business_owner", "helpdesk", "developer", "it_ops"];
  const users = {};
  for (const role of roles) {
    const email = `deeptest.${role}@egi.co.id`;
    // try create; if exists, login
    const createRes = await req("POST", "/users", {
      token: adminToken,
      body: {
        name: `Deep Test ${role}`,
        email,
        password: PASSWORD,
        role,
      },
    });
    if (![200, 201, 409].includes(createRes.status) && createRes.status !== 400) {
      // if 403 before RBAC fix, fall back to prisma
      await prisma.user.upsert({
        where: { email },
        update: { role, passwordHash: hashPassword(PASSWORD), isActive: true },
        create: {
          name: `Deep Test ${role}`,
          email,
          passwordHash: hashPassword(PASSWORD),
          role,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
    } else if (createRes.status === 409 || createRes.status === 400) {
      // ensure active + password
      await prisma.user.update({
        where: { email },
        data: { passwordHash: hashPassword(PASSWORD), isActive: true, role },
      });
    }
    const session = await login(email);
    users[role] = session;
  }
  return users;
}

async function section(title, fn) {
  console.log(`\n== ${title} ==`);
  await fn();
}

async function main() {
  console.log(`Deep API test against ${API}`);

  // --- Swagger ---
  await section("Swagger", async () => {
    await assert("GET /docs returns 200", async () => {
      const res = await fetch(DOCS);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
    });
  });

  // --- Auth ---
  let admin;
  await section("Auth", async () => {
    await assert("login success", async () => {
      admin = await login("egi.egiholding@gmail.com");
      if (!admin.access_token || !admin.refresh_cookie) throw new Error("missing access token or refresh cookie");
      if (admin.user.role !== "it_ops") throw new Error(`role=${admin.user.role}`);
      assertSnakeUser(admin.user);
    });

    await assert("login wrong password → 401", async () => {
      await req("POST", "/auth/login", {
        body: { email: "egi.egiholding@gmail.com", password: "WrongPass1!" },
        expectStatus: 401,
      });
    });

    await assert("login unknown email → 401", async () => {
      await req("POST", "/auth/login", {
        body: { email: "nobody@egi.co.id", password: PASSWORD },
        expectStatus: 401,
      });
    });

    await assert("login invalid email format → 400", async () => {
      await req("POST", "/auth/login", {
        body: { email: "not-an-email", password: PASSWORD },
        expectStatus: 400,
      });
    });

    await assert("login inactive user → 401", async () => {
      const email = "deeptest.inactive@egi.co.id";
      await prisma.user.upsert({
        where: { email },
        update: { isActive: false, passwordHash: hashPassword(PASSWORD) },
        create: {
          name: "Inactive",
          email,
          passwordHash: hashPassword(PASSWORD),
          role: UserRole.end_user,
          isActive: false,
        },
      });
      await req("POST", "/auth/login", {
        body: { email, password: PASSWORD },
        expectStatus: 401,
      });
    });

    await assert("refresh valid", async () => {
      const { data, headers } = await req("POST", "/auth/refresh", {
        cookie: admin.refresh_cookie,
        expectStatus: 200,
      });
      if (!data.access_token) throw new Error("no access_token");
      if ("refresh_token" in data) throw new Error("refresh leaked token in JSON");
      const cookie = refreshCookie(headers);
      if (!cookie || cookie === admin.refresh_cookie) throw new Error("refresh cookie was not rotated");
      admin.access_token = data.access_token;
      admin.refresh_cookie = cookie;
    });

    await assert("refresh invalid → 401", async () => {
      await req("POST", "/auth/refresh", {
        body: { refresh_token: "deadbeef".repeat(8) },
        expectStatus: 401,
      });
    });

    await assert("/auth/me with token", async () => {
      const { data } = await req("GET", "/auth/me", {
        token: admin.access_token,
        expectStatus: 200,
      });
      assertSnakeUser(data);
      if (data.email !== "egi.egiholding@gmail.com") throw new Error("wrong user");
    });

    await assert("/auth/me without token → 401", async () => {
      await req("GET", "/auth/me", { expectStatus: 401 });
    });

    await assert("protected route without token → 401", async () => {
      await req("GET", "/websites", { expectStatus: 401 });
    });

    await assert("malformed Bearer → 401", async () => {
      await req("GET", "/websites", {
        headers: { Authorization: "Bearer not.a.jwt" },
        expectStatus: 401,
      });
    });

    await assert("logout + refresh revoked → 401", async () => {
      const session = await login("egi.egiholding@gmail.com");
      const logout = await req("POST", "/auth/logout", {
        token: session.access_token,
        cookie: session.refresh_cookie,
        expectStatus: [200, 204],
      });
      if (logout.status === 200 && logout.data && Object.keys(logout.data).length) {
        // prefer 204 empty; flag if still 200 with body (will fail once we enforce 204)
      }
      if (logout.status !== 204) {
        throw new Error(`logout should be 204, got ${logout.status}`);
      }
      await req("POST", "/auth/refresh", {
        cookie: session.refresh_cookie,
        expectStatus: 401,
      });
      // re-login admin for rest of suite
      admin = await login("egi.egiholding@gmail.com");
    });
  });

  // --- Role users ---
  let roleSessions = {};
  await section("Users + roles", async () => {
    await assert("create users for each role + login", async () => {
      roleSessions = await ensureRoleUsers(admin.access_token);
      for (const role of Object.keys(roleSessions)) {
        if (roleSessions[role].user.role !== role) {
          throw new Error(`${role} login role mismatch`);
        }
      }
    });

    await assert("list users (it_ops)", async () => {
      const { data } = await req("GET", "/users?page=1&limit=10", {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!Array.isArray(data.data) || !data.meta) throw new Error("bad shape");
      assertSnakeUser(data.data[0]);
    });

    await assert("end_user cannot list users → 403", async () => {
      await req("GET", "/users", {
        token: roleSessions.end_user.access_token,
        expectStatus: 403,
      });
    });

    await assert("end_user cannot create user → 403", async () => {
      await req("POST", "/users", {
        token: roleSessions.end_user.access_token,
        body: {
          name: "X",
          email: "x.denied@egi.co.id",
          password: PASSWORD,
          role: "end_user",
        },
        expectStatus: 403,
      });
    });

    await assert("create user → 201", async () => {
      const email = `deeptest.create.${Date.now()}@egi.co.id`;
      const { status, data } = await req("POST", "/users", {
        token: admin.access_token,
        body: {
          name: "Created User",
          email,
          password: PASSWORD,
          role: "end_user",
        },
        expectStatus: 201,
      });
      if (status !== 201) throw new Error(`status ${status}`);
      assertSnakeUser(data);
    });

    await assert("duplicate email → 409", async () => {
      await req("POST", "/users", {
        token: admin.access_token,
        body: {
          name: "Dup",
          email: "egi.egiholding@gmail.com",
          password: PASSWORD,
          role: "end_user",
        },
        expectStatus: 409,
      });
    });

    await assert("invalid UUID → 400", async () => {
      await req("GET", "/users/not-a-uuid", {
        token: admin.access_token,
        expectStatus: 400,
      });
    });

    await assert("unknown user → 404", async () => {
      await req("GET", `/users/${randomUUID()}`, {
        token: admin.access_token,
        expectStatus: 404,
      });
    });

    await assert("pagination page=0 → 400", async () => {
      await req("GET", "/users?page=0", {
        token: admin.access_token,
        expectStatus: 400,
      });
    });

    await assert("pagination limit=1000 → 400", async () => {
      await req("GET", "/users?limit=1000", {
        token: admin.access_token,
        expectStatus: 400,
      });
    });

    await assert("invalid role enum → 400", async () => {
      await req("POST", "/users", {
        token: admin.access_token,
        body: {
          name: "Bad Role",
          email: `bad.role.${Date.now()}@egi.co.id`,
          password: PASSWORD,
          role: "superadmin",
        },
        expectStatus: 400,
      });
    });

    await assert("unknown field rejected → 400", async () => {
      await req("POST", "/users", {
        token: admin.access_token,
        body: {
          name: "Extra",
          email: `extra.${Date.now()}@egi.co.id`,
          password: PASSWORD,
          role: "end_user",
          hacker: true,
        },
        expectStatus: 400,
      });
    });

    await assert("update user", async () => {
      const email = `deeptest.patch.${Date.now()}@egi.co.id`;
      const { data: created } = await req("POST", "/users", {
        token: admin.access_token,
        body: { name: "Patch Me", email, password: PASSWORD, role: "end_user" },
        expectStatus: 201,
      });
      const { data } = await req("PATCH", `/users/${created.id}`, {
        token: admin.access_token,
        body: { name: "Patched", is_active: true },
        expectStatus: 200,
      });
      if (data.name !== "Patched") throw new Error("name not updated");
    });
  });

  // --- Websites ---
  let websiteId;
  let inactiveWebsiteId;
  await section("Websites", async () => {
    await assert("list websites", async () => {
      const { data } = await req("GET", "/websites?page=1&limit=5", {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!data.data?.length) throw new Error("expected seeded websites");
      websiteId = data.data[0].id;
      for (const k of ["owner_id", "monitoring_interval_minutes", "is_active", "created_at"]) {
        if (!(k in data.data[0])) throw new Error(`missing ${k}`);
      }
    });

    await assert("create website → 201", async () => {
      const { data } = await req("POST", "/websites", {
        token: admin.access_token,
        body: {
          name: `Deep Test Site ${Date.now()}`,
          // Use a resolvable public target: website creation now correctly
          // rejects hosts that cannot be resolved, as part of SSRF protection.
          domain: "example.com",
          url: "https://example.com/",
          owner_id: roleSessions.business_owner.user.id,
          monitoring_interval_minutes: 5,
          is_active: true,
        },
        expectStatus: 201,
      });
      inactiveWebsiteId = data.id;
    });

    await assert("owner can list/detail own website while another owner cannot", async () => {
      const ownerList = await req("GET", "/websites", {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      if (!ownerList.data.data.some((website) => website.id === inactiveWebsiteId)) {
        throw new Error("owner cannot see assigned website");
      }
      await req("GET", `/websites/${inactiveWebsiteId}`, {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      const otherList = await req("GET", "/websites", {
        token: roleSessions.end_user.access_token,
        expectStatus: 200,
      });
      if (otherList.data.data.some((website) => website.id === inactiveWebsiteId)) {
        throw new Error("other owner can list assigned website");
      }
      await req("GET", `/websites/${inactiveWebsiteId}`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 404,
      });
    });

    await assert("end_user cannot create website → 403", async () => {
      await req("POST", "/websites", {
        token: roleSessions.end_user.access_token,
        body: {
          name: "Denied",
          domain: "denied.example",
          url: "https://denied.example/",
        },
        expectStatus: 403,
      });
    });

    await assert("invalid URL → 400", async () => {
      await req("POST", "/websites", {
        token: admin.access_token,
        body: {
          name: "Bad URL",
          domain: "x",
          url: "not-a-url",
        },
        expectStatus: 400,
      });
    });

    await assert("unknown website owner → 404", async () => {
      await req("POST", "/websites", {
        token: admin.access_token,
        body: {
          name: "Unknown Owner",
          domain: "example.com",
          url: "https://example.com/",
          owner_id: randomUUID(),
        },
        expectStatus: 404,
      });
      await req("PATCH", `/websites/${inactiveWebsiteId}`, {
        token: admin.access_token,
        body: { owner_id: randomUUID() },
        expectStatus: 404,
      });
    });

    await assert("missing fields → 400", async () => {
      await req("POST", "/websites", {
        token: admin.access_token,
        body: { name: "Only name" },
        expectStatus: 400,
      });
    });

    await assert("get unknown website → 404", async () => {
      await req("GET", `/websites/${randomUUID()}`, {
        token: admin.access_token,
        expectStatus: 404,
      });
    });

    await assert("update website", async () => {
      const { data } = await req("PATCH", `/websites/${inactiveWebsiteId}`, {
        token: admin.access_token,
        body: { name: "Deep Test Site Updated" },
        expectStatus: 200,
      });
      if (data.name !== "Deep Test Site Updated") throw new Error("not updated");
    });

    await assert("DELETE soft-deactivate → 204 + is_active false", async () => {
      await req("DELETE", `/websites/${inactiveWebsiteId}`, {
        token: admin.access_token,
        expectStatus: 204,
      });
      const { data } = await req("GET", `/websites/${inactiveWebsiteId}`, {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (data.is_active !== false) throw new Error("still active");
    });

    await assert("list filter is_active=false", async () => {
      const { data } = await req("GET", "/websites?is_active=false&limit=100", {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!data.data.some((w) => w.id === inactiveWebsiteId)) {
        throw new Error("deactivated site missing from filter");
      }
      if (data.data.some((w) => w.is_active !== false)) {
        throw new Error("active site leaked into is_active=false");
      }
    });

    await assert("list filter is_active=true excludes deactivated", async () => {
      const { data } = await req("GET", "/websites?is_active=true&limit=100", {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (data.data.some((w) => w.id === inactiveWebsiteId)) {
        throw new Error("deactivated site in active list");
      }
    });
  });

  // --- Monitoring fixture ---
  let monitoringId;
  let monitoringNoShotId;
  let ownerMonitoringId;
  await section("Monitoring", async () => {
    await assert("seed monitoring results via prisma", async () => {
      const site = await prisma.website.findFirst({ where: { isActive: true } });
      if (!site) throw new Error("no active website");
      websiteId = site.id;

      await prisma.monitoringResult.deleteMany({
        where: { websiteId: site.id, scheduledAt: { gte: new Date("2099-01-01") } },
      });

      const withShot = await prisma.monitoringResult.create({
        data: {
          websiteId: site.id,
          scheduledAt: new Date("2099-01-01T00:00:00.000Z"),
          checkedAt: new Date("2099-01-01T00:00:05.000Z"),
          status: MonitoringStatus.normal,
          httpStatus: 200,
          responseTimeMs: 120,
          screenshotUrl: "https://example.com/shot.png",
        },
      });
      const noShot = await prisma.monitoringResult.create({
        data: {
          websiteId: site.id,
          scheduledAt: new Date("2099-01-01T00:05:00.000Z"),
          checkedAt: new Date("2099-01-01T00:05:05.000Z"),
          status: MonitoringStatus.warning,
          httpStatus: 500,
          responseTimeMs: 900,
          screenshotUrl: null,
        },
      });
      monitoringId = withShot.id;
      monitoringNoShotId = noShot.id;
      const ownerResult = await prisma.monitoringResult.create({
        data: {
          websiteId: inactiveWebsiteId,
          scheduledAt: new Date("2099-01-02T00:00:00.000Z"),
          checkedAt: new Date("2099-01-02T00:00:05.000Z"),
          status: MonitoringStatus.normal,
          httpStatus: 200,
          responseTimeMs: 100,
          screenshotUrl: null,
        },
      });
      ownerMonitoringId = ownerResult.id;
    });

    await assert("latest returns result", async () => {
      const { data } = await req("GET", `/websites/${websiteId}/monitoring-results/latest`, {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!data.id) throw new Error("no id");
      for (const k of ["website_id", "scheduled_at", "checked_at", "http_status", "screenshot_url"]) {
        if (!(k in data)) throw new Error(`missing ${k}`);
      }
    });

    await assert("monitoring results are scoped to the website owner", async () => {
      await req("GET", `/websites/${inactiveWebsiteId}/monitoring-results/latest`, {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      await req("GET", `/monitoring-results/${ownerMonitoringId}`, {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      await req("GET", `/websites/${inactiveWebsiteId}/monitoring-results/latest`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 404,
      });
      await req("GET", `/monitoring-results/${ownerMonitoringId}`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 404,
      });
    });

    await assert("latest when no results → 404", async () => {
      const emptySite = await prisma.website.create({
        data: {
          name: `Empty Mon ${Date.now()}`,
          domain: "empty-mon.example",
          url: "https://empty-mon.example/",
          isActive: true,
        },
      });
      await req("GET", `/websites/${emptySite.id}/monitoring-results/latest`, {
        token: admin.access_token,
        expectStatus: 404,
      });
      await prisma.website.delete({ where: { id: emptySite.id } });
    });

    await assert("history pagination", async () => {
      const { data } = await req(
        "GET",
        `/websites/${websiteId}/monitoring-results?page=1&limit=2&status=warning`,
        { token: admin.access_token, expectStatus: 200 },
      );
      if (!data.meta || !Array.isArray(data.data)) throw new Error("bad shape");
    });

    await assert("get monitoring by id", async () => {
      await req("GET", `/monitoring-results/${monitoringId}`, {
        token: admin.access_token,
        expectStatus: 200,
      });
    });

    await assert("screenshot when null → 404", async () => {
      await req("GET", `/monitoring-results/${monitoringNoShotId}/screenshot`, {
        token: admin.access_token,
        expectStatus: 404,
      });
    });

    await assert("screenshot when present → 200", async () => {
      const { data } = await req("GET", `/monitoring-results/${monitoringId}/screenshot`, {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!data.url || !data.expires_at) throw new Error("bad screenshot payload");
    });

    await assert("invalid websiteId → 400", async () => {
      await req("GET", "/websites/bad-id/monitoring-results/latest", {
        token: admin.access_token,
        expectStatus: 400,
      });
    });

    await assert("unknown websiteId → 404", async () => {
      await req("GET", `/websites/${randomUUID()}/monitoring-results/latest`, {
        token: admin.access_token,
        expectStatus: 404,
      });
    });
  });

  // --- Incidents ---
  let openIncidentId;
  let resolvedIncidentId;
  let closedIncidentId;
  let ownerIncidentId;
  await section("Incidents", async () => {
    await assert("seed incidents", async () => {
      const open = await prisma.incident.create({
        data: {
          websiteId,
          title: "Deep open incident",
          severity: Severity.high,
          status: IncidentStatus.open,
          startedAt: new Date(),
        },
      });
      const resolved = await prisma.incident.create({
        data: {
          websiteId,
          title: "Deep resolved incident",
          severity: Severity.medium,
          status: IncidentStatus.resolved,
          startedAt: new Date(Date.now() - 3600_000),
          resolvedAt: new Date(),
        },
      });
      const closed = await prisma.incident.create({
        data: {
          websiteId,
          title: "Deep closed incident",
          severity: Severity.low,
          status: IncidentStatus.closed,
          startedAt: new Date(Date.now() - 7200_000),
          resolvedAt: new Date(Date.now() - 3600_000),
          closedAt: new Date(),
        },
      });
      openIncidentId = open.id;
      resolvedIncidentId = resolved.id;
      closedIncidentId = closed.id;
      const ownerIncident = await prisma.incident.create({
        data: {
          websiteId: inactiveWebsiteId,
          title: "Deep owner incident",
          severity: Severity.low,
          status: IncidentStatus.open,
          startedAt: new Date(),
        },
      });
      ownerIncidentId = ownerIncident.id;
    });

    await assert("list filters status", async () => {
      const { data } = await req("GET", `/incidents?status=open&website_id=${websiteId}`, {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!data.data.every((i) => i.status === "open")) throw new Error("status filter failed");
    });

    await assert("incidents are scoped to the website owner", async () => {
      const ownerList = await req("GET", "/incidents", {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      if (!ownerList.data.data.some((incident) => incident.id === ownerIncidentId)) {
        throw new Error("owner cannot see assigned incident");
      }
      await req("GET", `/incidents/${ownerIncidentId}`, {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      const otherList = await req("GET", "/incidents", {
        token: roleSessions.end_user.access_token,
        expectStatus: 200,
      });
      if (otherList.data.data.some((incident) => incident.id === ownerIncidentId)) {
        throw new Error("other owner can list assigned incident");
      }
      await req("GET", `/incidents/${ownerIncidentId}`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 404,
      });
    });

    await assert("list active_only excludes closed", async () => {
      const { data } = await req("GET", `/incidents?active_only=true&website_id=${websiteId}&limit=100`, {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (data.data.some((i) => i.status === "closed")) throw new Error("closed in active_only");
    });

    await assert("update severity/status", async () => {
      const { data } = await req("PATCH", `/incidents/${openIncidentId}`, {
        token: roleSessions.helpdesk.access_token,
        body: { severity: "critical", status: "in_progress" },
        expectStatus: 200,
      });
      if (data.severity !== "critical" || data.status !== "in_progress") {
        throw new Error("update failed");
      }
    });

    await assert("end_user cannot update incident → 403", async () => {
      await req("PATCH", `/incidents/${openIncidentId}`, {
        token: roleSessions.end_user.access_token,
        body: { severity: "low" },
        expectStatus: 403,
      });
    });

    await assert("close resolved → 200", async () => {
      const { data } = await req("POST", `/incidents/${resolvedIncidentId}/close`, {
        token: roleSessions.helpdesk.access_token,
        expectStatus: 200,
      });
      if (data.status !== "closed" || !data.closed_at) throw new Error("not closed");
    });

    await assert("close already closed → 400", async () => {
      await req("POST", `/incidents/${closedIncidentId}/close`, {
        token: admin.access_token,
        expectStatus: 400,
      });
    });

    await assert("close open blocked → 400", async () => {
      // reopen a fresh open
      const fresh = await prisma.incident.create({
        data: {
          websiteId,
          title: "Still open",
          severity: Severity.high,
          status: IncidentStatus.open,
          startedAt: new Date(),
        },
      });
      await req("POST", `/incidents/${fresh.id}/close`, {
        token: admin.access_token,
        expectStatus: 400,
      });
    });

    await assert("unknown incident → 404", async () => {
      await req("GET", `/incidents/${randomUUID()}`, {
        token: admin.access_token,
        expectStatus: 404,
      });
    });
  });

  // --- Tickets ---
  let ticketId;
  let ownerTicketId;
  await section("Tickets", async () => {
    await assert("create ticket for existing incident → 201", async () => {
      const { data } = await req("POST", "/tickets", {
        token: roleSessions.developer.access_token,
        body: {
          incident_id: openIncidentId,
          title: "Deep ticket",
          priority: "high",
          assigned_to: roleSessions.developer.user.id,
        },
        expectStatus: 201,
      });
      ticketId = data.id;
      if (data.status !== "open") throw new Error("status not open");
    });

    await assert("tickets are scoped through the incident website owner", async () => {
      const ownerTicket = await prisma.ticket.create({
        data: {
          incidentId: ownerIncidentId,
          title: "Deep owner ticket",
          priority: "low",
          status: "open",
        },
      });
      ownerTicketId = ownerTicket.id;
      const ownerList = await req("GET", "/tickets", {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      if (!ownerList.data.data.some((ticket) => ticket.id === ownerTicketId)) {
        throw new Error("owner cannot see assigned ticket");
      }
      await req("GET", `/tickets/${ownerTicketId}`, {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      const otherList = await req("GET", "/tickets", {
        token: roleSessions.end_user.access_token,
        expectStatus: 200,
      });
      if (otherList.data.data.some((ticket) => ticket.id === ownerTicketId)) {
        throw new Error("other owner can list assigned ticket");
      }
      await req("GET", `/tickets/${ownerTicketId}`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 404,
      });
    });

    await assert("create for missing incident → 404", async () => {
      await req("POST", "/tickets", {
        token: roleSessions.developer.access_token,
        body: {
          incident_id: randomUUID(),
          title: "Missing",
          priority: "low",
        },
        expectStatus: 404,
      });
    });

    await assert("end_user cannot create ticket → 403", async () => {
      await req("POST", "/tickets", {
        token: roleSessions.end_user.access_token,
        body: {
          incident_id: openIncidentId,
          title: "Denied",
          priority: "low",
        },
        expectStatus: 403,
      });
    });

    await assert("assign + resolve sets resolved_at", async () => {
      const { data } = await req("PATCH", `/tickets/${ticketId}`, {
        token: roleSessions.developer.access_token,
        body: { status: "resolved" },
        expectStatus: 200,
      });
      if (!data.resolved_at) throw new Error("resolved_at not set");
    });

    await assert("closed also sets resolved_at", async () => {
      const { data: created } = await req("POST", "/tickets", {
        token: admin.access_token,
        body: {
          incident_id: openIncidentId,
          title: "Close me",
          priority: "medium",
        },
        expectStatus: 201,
      });
      const { data } = await req("PATCH", `/tickets/${created.id}`, {
        token: admin.access_token,
        body: { status: "closed" },
        expectStatus: 200,
      });
      if (!data.resolved_at) throw new Error("resolved_at not set on closed");
    });

    await assert("filters", async () => {
      const { data } = await req(
        "GET",
        `/tickets?incident_id=${openIncidentId}&status=resolved`,
        { token: admin.access_token, expectStatus: 200 },
      );
      if (!data.data.every((t) => t.status === "resolved")) throw new Error("filter failed");
    });
  });

  // --- Notifications ---
  let notifA;
  let notifB;
  await section("Notifications", async () => {
    await assert("seed notifications for two users", async () => {
      const userA = roleSessions.end_user.user.id;
      const userB = roleSessions.business_owner.user.id;
      await prisma.notification.deleteMany({
        where: { userId: { in: [userA, userB] }, title: { startsWith: "DeepNotif" } },
      });
      notifA = await prisma.notification.create({
        data: {
          userId: userA,
          channel: NotificationChannel.dashboard,
          title: "DeepNotif A1",
          message: "hello A",
          status: NotificationStatus.sent,
          sentAt: new Date(),
        },
      });
      await prisma.notification.create({
        data: {
          userId: userA,
          channel: NotificationChannel.dashboard,
          title: "DeepNotif A2",
          message: "hello A2",
          status: NotificationStatus.sent,
          sentAt: new Date(),
        },
      });
      notifB = await prisma.notification.create({
        data: {
          userId: userB,
          channel: NotificationChannel.dashboard,
          title: "DeepNotif B1",
          message: "hello B",
          status: NotificationStatus.sent,
          sentAt: new Date(),
        },
      });
    });

    await assert("list current user + unread_count", async () => {
      const { data } = await req("GET", "/notifications?unread_only=true", {
        token: roleSessions.end_user.access_token,
        expectStatus: 200,
      });
      if (typeof data.unread_count !== "number") throw new Error("no unread_count");
      if (!data.data.every((n) => n.read_at === null)) throw new Error("read leaked");
      if (data.data.some((n) => n.user_id !== roleSessions.end_user.user.id)) {
        throw new Error("cross-user leak");
      }
    });

    await assert("user A cannot mark B notification → 404", async () => {
      await req("POST", `/notifications/${notifB.id}/read`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 404,
      });
    });

    await assert("mark read", async () => {
      const { data } = await req("POST", `/notifications/${notifA.id}/read`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 200,
      });
      if (!data.read_at) throw new Error("read_at not set");
    });

    await assert("read-all isolation", async () => {
      const beforeB = await prisma.notification.count({
        where: { userId: roleSessions.business_owner.user.id, readAt: null },
      });
      await req("POST", "/notifications/read-all", {
        token: roleSessions.end_user.access_token,
        expectStatus: 200,
      });
      const afterB = await prisma.notification.count({
        where: { userId: roleSessions.business_owner.user.id, readAt: null },
      });
      if (beforeB !== afterB) throw new Error("read-all affected other user");
      const unreadA = await prisma.notification.count({
        where: {
          userId: roleSessions.end_user.user.id,
          channel: NotificationChannel.dashboard,
          readAt: null,
        },
      });
      if (unreadA !== 0) throw new Error("A still has unread");
    });
  });

  // --- Dashboard ---
  await section("Dashboard", async () => {
    await assert("main cards for active websites", async () => {
      const { data } = await req("GET", "/dashboard", {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!Array.isArray(data.data)) throw new Error("bad shape");
      if (data.data.some((c) => c.website.is_active !== true)) {
        throw new Error("inactive website in dashboard");
      }
    });

    await assert("detail with history_limit", async () => {
      const { data } = await req("GET", `/dashboard/websites/${websiteId}?history_limit=5`, {
        token: admin.access_token,
        expectStatus: 200,
      });
      if (!data.website || !Array.isArray(data.monitoring_history)) {
        throw new Error("bad detail shape");
      }
      if (data.monitoring_history.length > 5) throw new Error("history_limit ignored");
    });

    await assert("history_limit bounds → 400", async () => {
      await req("GET", `/dashboard/websites/${websiteId}?history_limit=0`, {
        token: admin.access_token,
        expectStatus: 400,
      });
      await req("GET", `/dashboard/websites/${websiteId}?history_limit=999`, {
        token: admin.access_token,
        expectStatus: 400,
      });
    });

    await assert("unknown website → 404", async () => {
      await req("GET", `/dashboard/websites/${randomUUID()}`, {
        token: admin.access_token,
        expectStatus: 404,
      });
    });

    await assert("dashboard detail is scoped to the website owner", async () => {
      await req("GET", `/dashboard/websites/${inactiveWebsiteId}`, {
        token: roleSessions.business_owner.access_token,
        expectStatus: 200,
      });
      await req("GET", `/dashboard/websites/${inactiveWebsiteId}`, {
        token: roleSessions.end_user.access_token,
        expectStatus: 404,
      });
    });
  });

  // Summary
  console.log(`\n==============================`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  if (failed) {
    console.log("\nFailures:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(` - ${r.name}: ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nAll deep API tests GREEN.");
  }
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
