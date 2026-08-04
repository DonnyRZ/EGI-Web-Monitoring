/**
 * RBAC frontend Playwright checks.
 * Backend: 3101, Frontend: 3010
 * Usage: node scripts/rbac-fe-playwright.mjs
 */
import { chromium } from "playwright";

const FE = process.env.FE_URL || "http://127.0.0.1:3010";
const PASSWORD = "TestRbac123!";
const users = {
  superadmin: "rbac.superadmin@egi.test",
  developer: "rbac.developer@egi.test",
  end_user: "rbac.enduser@egi.test",
};

let failed = 0;

function ok(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  failed += 1;
  console.error(`FAIL  ${name} — ${detail}`);
}

async function login(page, email) {
  await page.goto(`${FE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").waitFor({ state: "visible", timeout: 20000 });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 25000 });
  await page.locator(".website-card, .card-grid, .empty-state, .state-box").first().waitFor({
    timeout: 20000,
  });
}

async function navLabels(page) {
  const items = page.locator(".sidebar a");
  await items.first().waitFor({ timeout: 15000 });
  const count = await items.count();
  const labels = [];
  for (let i = 0; i < count; i += 1) {
    labels.push((await items.nth(i).innerText()).replace(/\s+/g, " ").trim());
  }
  return labels;
}

async function main() {
  console.log(`RBAC FE Playwright → ${FE}\n`);
  const browser = await chromium.launch({ headless: true });

  async function withRole(roleEmail, fn) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    try {
      await login(page, roleEmail);
      await fn(page);
    } finally {
      await context.close();
    }
  }

  try {
    await withRole(users.superadmin, async (page) => {
      ok("superadmin login → dashboard");
      const labels = await navLabels(page);
      if (!labels.some((l) => /dashboard/i.test(l))) fail("superadmin nav dashboard", labels.join(" | "));
      else ok("superadmin has Dashboard");
      if (!labels.some((l) => /incident/i.test(l))) fail("superadmin nav incidents", labels.join(" | "));
      else ok("superadmin has Incidents");
      if (!labels.some((l) => /website/i.test(l))) fail("superadmin nav websites", labels.join(" | "));
      else ok("superadmin has Kelola Website");
      if (!labels.some((l) => /user/i.test(l))) fail("superadmin nav users", labels.join(" | "));
      else ok("superadmin has Users");

      const firstCard = page.locator("a.website-card").first();
      await firstCard.waitFor({ timeout: 15000 });
      const href = await firstCard.getAttribute("href");
      if (!href || !href.startsWith("/websites/")) {
        fail("superadmin card href", String(href));
      } else {
        ok("superadmin card → monitoring detail", href);
        await firstCard.click();
        await page.waitForURL(/\/websites\//, { timeout: 15000 });
        ok("superadmin opens website detail");
      }
    });

    await withRole(users.developer, async (page) => {
      ok("developer login → dashboard");
      const labels = await navLabels(page);
      if (!labels.some((l) => /incident/i.test(l))) fail("developer nav incidents", labels.join(" | "));
      else ok("developer has Incidents");
      if (labels.some((l) => /kelola website|^users$/i.test(l))) {
        fail("developer must not see admin", labels.join(" | "));
      } else ok("developer hides admin nav");

      const devCard = page.locator("a.website-card").first();
      await devCard.waitFor({ timeout: 15000 });
      const devHref = await devCard.getAttribute("href");
      if (!devHref?.startsWith("/websites/")) fail("developer card href", String(devHref));
      else ok("developer card → monitoring detail", devHref);
    });

    await withRole(users.end_user, async (page) => {
      ok("end_user login → dashboard");
      const labels = await navLabels(page);
      if (labels.some((l) => /incident/i.test(l))) fail("end_user must hide Incidents", labels.join(" | "));
      else ok("end_user hides Incidents");
      if (labels.some((l) => /kelola website|^users$/i.test(l))) {
        fail("end_user must hide admin", labels.join(" | "));
      } else ok("end_user hides admin");

      const euCard = page.locator("a.website-card").first();
      await euCard.waitFor({ timeout: 15000 });
      const euHref = await euCard.getAttribute("href");
      const target = await euCard.getAttribute("target");
      if (!euHref || !/^https?:\/\//.test(euHref)) {
        fail("end_user card should be external url", String(euHref));
      } else if (target !== "_blank") {
        fail("end_user card target=_blank", String(target));
      } else {
        ok("end_user card opens live website", euHref);
      }

      await page.goto(`${FE}/websites/11111111-1111-4111-8111-111111111111`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      ok("end_user blocked from /websites/[id]");

      await page.goto(`${FE}/incidents`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      ok("end_user blocked from /incidents");

      await page.goto(`${FE}/admin/users`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      ok("end_user blocked from /admin/users");
    });
  } catch (err) {
    fail("playwright run", err?.message || String(err));
  } finally {
    await browser.close();
  }

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nAll FE RBAC checks passed");
}

main();
