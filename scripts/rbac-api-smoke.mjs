/**
 * RBAC API smoke tests against a running backend.
 * Usage: node scripts/rbac-api-smoke.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:3101/api
 */
const API = (process.argv[2] || "http://127.0.0.1:3101/api").replace(/\/$/, "");
const PASSWORD = "TestRbac123!";

const users = {
  superadmin: "rbac.superadmin@egi.test",
  developer: "rbac.developer@egi.test",
  end_user: "rbac.enduser@egi.test",
};

let failed = 0;
const results = [];

function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  failed += 1;
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body)}`);
  }
  return {
    token: body.access_token,
    user: body.user,
    headers: {
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

async function req(path, { method = "GET", headers = {}, body, expectStatus } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (expectStatus != null && res.status !== expectStatus) {
    const err = new Error(`${method} ${path}: expected ${expectStatus}, got ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`RBAC API smoke → ${API}\n`);

  // Health
  try {
    await req("/health", { expectStatus: 200 });
    ok("health");
  } catch (e) {
    fail("health", e.message);
    process.exit(1);
  }

  const sessions = {};
  for (const [role, email] of Object.entries(users)) {
    try {
      sessions[role] = await login(email);
      if (sessions[role].user.role !== role) {
        fail(`login role ${role}`, `got ${sessions[role].user.role}`);
      } else {
        ok(`login ${role}`);
      }
    } catch (e) {
      fail(`login ${role}`, e.message);
    }
  }

  if (failed) {
    console.error("\nAborting: login failed");
    process.exit(1);
  }

  // Dashboard list
  try {
    const { json: sa } = await req("/dashboard", {
      headers: sessions.superadmin.headers,
      expectStatus: 200,
    });
    const { json: eu } = await req("/dashboard", {
      headers: sessions.end_user.headers,
      expectStatus: 200,
    });
    const saCount = sa.data?.length ?? 0;
    const euCount = eu.data?.length ?? 0;
    if (saCount < 1) fail("dashboard superadmin", "no websites");
    else ok("dashboard superadmin", `${saCount} websites`);
    if (euCount < 1) fail("dashboard end_user active gallery", "expected >=1 visible site");
    else {
      const hidden = (eu.data || []).filter((c) => {
        const s = c.latest_result?.status;
        return !s || s === "down" || s === "unknown";
      });
      if (hidden.length) fail("dashboard end_user hides down/unknown", hidden[0]?.latest_result?.status || "missing");
      else ok("dashboard end_user active gallery", `${euCount} visible (<= ${saCount})`);
    }
  } catch (e) {
    fail("dashboard", e.message);
  }

  // Dashboard detail
  try {
    const { json: sa } = await req("/dashboard", {
      headers: sessions.superadmin.headers,
      expectStatus: 200,
    });
    const siteId = sa.data[0].website.id;
    await req(`/dashboard/websites/${siteId}`, {
      headers: sessions.superadmin.headers,
      expectStatus: 200,
    });
    ok("dashboard detail superadmin");
    await req(`/dashboard/websites/${siteId}`, {
      headers: sessions.developer.headers,
      expectStatus: 200,
    });
    ok("dashboard detail developer");
    await req(`/dashboard/websites/${siteId}`, {
      headers: sessions.end_user.headers,
      expectStatus: 403,
    });
    ok("dashboard detail end_user forbidden");
  } catch (e) {
    fail("dashboard detail", e.message);
  }

  // Users admin
  try {
    await req("/users?limit=5", {
      headers: sessions.superadmin.headers,
      expectStatus: 200,
    });
    ok("users list superadmin");
    await req("/users?limit=5", {
      headers: sessions.developer.headers,
      expectStatus: 403,
    });
    ok("users list developer forbidden");
    await req("/users?limit=5", {
      headers: sessions.end_user.headers,
      expectStatus: 403,
    });
    ok("users list end_user forbidden");
  } catch (e) {
    fail("users admin", e.message);
  }

  // Websites write
  try {
    await req("/websites", {
      method: "POST",
      headers: sessions.developer.headers,
      body: {
        name: "Should Fail",
        url: "https://example.com/",
        monitoring_interval_minutes: 5,
      },
      expectStatus: 403,
    });
    ok("websites create developer forbidden");
  } catch (e) {
    fail("websites create developer", e.message);
  }

  // Incidents read
  try {
    await req("/incidents?limit=5", {
      headers: sessions.superadmin.headers,
      expectStatus: 200,
    });
    ok("incidents list superadmin");
    await req("/incidents?limit=5", {
      headers: sessions.developer.headers,
      expectStatus: 200,
    });
    ok("incidents list developer");
    await req("/incidents?limit=5", {
      headers: sessions.end_user.headers,
      expectStatus: 403,
    });
    ok("incidents list end_user forbidden");
  } catch (e) {
    fail("incidents list", e.message);
  }

  // Incident mutate roles
  try {
    const { json } = await req("/incidents?limit=20&active_only=true", {
      headers: sessions.superadmin.headers,
      expectStatus: 200,
    });
    const incident = (json.data || []).find((i) => String(i.title || "").includes("[RBAC-TEST]")) || json.data?.[0];
    if (!incident) {
      fail("incident mutate", "no active incident available");
    } else {
      await req(`/incidents/${incident.id}`, {
        method: "PATCH",
        headers: sessions.developer.headers,
        body: { status: "in_progress" },
        expectStatus: 403,
      });
      ok("incident patch developer forbidden");

      await req(`/incidents/${incident.id}`, {
        method: "PATCH",
        headers: sessions.superadmin.headers,
        body: { status: "in_progress" },
        expectStatus: 200,
      });
      ok("incident patch superadmin allowed");

      const createDev = await req("/tickets", {
        method: "POST",
        headers: sessions.developer.headers,
        body: {
          incident_id: incident.id,
          title: `[RBAC-TEST] developer ticket ${Date.now()}`,
          priority: "medium",
        },
        expectStatus: 201,
      });
      ok("tickets create developer allowed", createDev.json?.id || "");

      await req(`/incidents/${incident.id}`, {
        method: "PATCH",
        headers: sessions.developer.headers,
        body: { status: "resolved" },
        expectStatus: 403,
      });
      ok("incident resolve developer forbidden");

      await req(`/incidents/${incident.id}`, {
        method: "PATCH",
        headers: sessions.superadmin.headers,
        body: { status: "resolved" },
        expectStatus: 200,
      });
      ok("incident resolve superadmin allowed");

      await req(`/incidents/${incident.id}/close`, {
        method: "POST",
        headers: sessions.developer.headers,
        expectStatus: 403,
      });
      ok("incident close developer forbidden");

      await req(`/incidents/${incident.id}/close`, {
        method: "POST",
        headers: sessions.superadmin.headers,
        expectStatus: 200,
      });
      ok("incident close superadmin allowed");
    }
  } catch (e) {
    fail("incident mutate", e.message);
  }

  // Tickets write roles
  try {
    await req("/tickets", {
      method: "POST",
      headers: sessions.end_user.headers,
      body: {
        incident_id: "00000000-0000-4000-8000-000000000001",
        title: "x",
      },
      expectStatus: 403,
    });
    ok("tickets create end_user forbidden");
  } catch (e) {
    fail("tickets create end_user", e.message);
  }

  // Websites create authorization (superadmin allowed past role gate; URL safety may still 400)
  try {
    const stamp = Date.now();
    const createSa = await fetch(`${API}/websites`, {
      method: "POST",
      headers: sessions.superadmin.headers,
      body: JSON.stringify({
        name: `RBAC Temp ${stamp}`,
        domain: `egi-inovasi.com`,
        url: `https://egi-inovasi.com/?rbac=${stamp}`,
        monitoring_interval_minutes: 5,
      }),
    });
    if (createSa.status === 403) {
      fail("websites create superadmin", "unexpected 403");
    } else if (createSa.status === 201) {
      const created = await createSa.json();
      ok("websites create superadmin");
      if (created?.id) {
        await req(`/websites/${created.id}`, {
          method: "DELETE",
          headers: sessions.superadmin.headers,
          expectStatus: 204,
        });
        ok("websites deactivate superadmin");
      }
    } else {
      ok(`websites create superadmin authorized (${createSa.status})`);
    }
  } catch (e) {
    fail("websites create superadmin", e.message);
  }

  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
