import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!baseURL || !email || !password) {
  console.log("SKIP mobile layout E2E: set E2E_BASE_URL, E2E_EMAIL, and E2E_PASSWORD for an isolated local app.");
  process.exit(0);
}

const parsedBaseURL = new URL(baseURL);
if (!new Set(["127.0.0.1", "localhost"]).has(parsedBaseURL.hostname)) {
  throw new Error("Refusing to run mobile layout E2E outside localhost/127.0.0.1");
}

const browser = await chromium.launch({ headless: true });
const viewports = [
  { width: 375, height: 812, label: "small mobile" },
  { width: 390, height: 844, label: "compact mobile" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1024, height: 900, label: "tablet" },
  { width: 1440, height: 900, label: "desktop" },
];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    try {
      await login(page);
      await assertNoPageOverflow(page, `${viewport.label} dashboard`);

      if (viewport.width < 1100) {
        const menu = page.getByRole("button", { name: "Buka menu" });
        await assertVisible(menu, `${viewport.label} menu button`);
        await menu.click();
        const nav = page.getByRole("dialog", { name: "Menu navigasi" });
        await assertVisible(nav, `${viewport.label} navigation drawer`);
        assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", `${viewport.label} should lock body while menu is open`);
        await nav.getByRole("button", { name: "Tutup menu" }).click();
        assert.equal(await page.getByRole("dialog", { name: "Menu navigasi" }).count(), 0, `${viewport.label} navigation drawer should close`);
      }

      await checkTaskMonitoring(page, viewport);
      await checkProjects(page, viewport);
      await checkStories(page, viewport);
      await checkIncidents(page, viewport);
      await checkUsers(page, viewport);
    } finally {
      await context.close();
    }
  }
  console.log("PASS adaptive mobile layout, overlay, filter, and overflow E2E");
} finally {
  await browser.close();
}

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(/\/dashboard(?:\?.*)?$/);
}

async function gotoIfAccessible(page, path, heading) {
  await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
  const visible = await page.getByRole("heading", { name: heading, exact: true }).isVisible().catch(() => false);
  return visible;
}

async function checkTaskMonitoring(page, viewport) {
  if (!await gotoIfAccessible(page, "/tasks", "Task Monitoring")) return;
  await assertNoPageOverflow(page, `${viewport.label} Task Monitoring`);
  if (viewport.width < 1100) {
    const trigger = page.getByRole("button", { name: /^Filter(?: · \d+ aktif)?$/ }).first();
    await assertVisible(trigger, `${viewport.label} Task Monitoring filter trigger`);
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "Filter Task Monitoring" });
    await assertVisible(sheet, `${viewport.label} Task Monitoring filter sheet`);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", `${viewport.label} filter sheet should lock body`);
    await sheet.getByRole("button", { name: "Batal", exact: true }).click();
  }
  const rows = page.locator(".task-overview-table-row");
  if (await rows.count() > 0) {
    await rows.first().click();
    const drawer = page.getByRole("dialog", { name: /Task pada/ });
    await assertVisible(drawer, `${viewport.label} Task drawer`);
    await assertNoPageOverflow(page, `${viewport.label} Task drawer`);
    await drawer.getByRole("button", { name: /Tutup detail Project/ }).click();
  }
}

async function checkProjects(page, viewport) {
  await page.goto(`${baseURL}/projects`, { waitUntil: "domcontentloaded" });
  const accessible = await page.getByRole("heading", { name: /^(Kelola Project|Project Saya)$/, exact: true }).isVisible().catch(() => false);
  if (!accessible) return;
  await assertNoPageOverflow(page, `${viewport.label} Projects`);
  if (viewport.width < 1100) {
    await assertVisible(page.locator(".project-mobile-toolbar"), `${viewport.label} Project mobile toolbar`);
    await assertVisible(page.locator(".project-card-grid"), `${viewport.label} Project cards`);
    const table = page.locator(".project-table-wrap");
    assert.equal(await table.isVisible().catch(() => false), false, `${viewport.label} should not show the desktop Project table`);
  }
}

async function checkStories(page, viewport) {
  if (!await gotoIfAccessible(page, "/user-stories", "User Stories")) return;
  await assertNoPageOverflow(page, `${viewport.label} User Stories`);
  if (viewport.width < 1100) {
    assert.equal(await page.locator(".desktop-story-board").isVisible().catch(() => false), false, `${viewport.label} should not show the six-column board`);
  }
}

async function checkIncidents(page, viewport) {
  if (!await gotoIfAccessible(page, "/incidents", "Incidents")) return;
  await assertNoPageOverflow(page, `${viewport.label} Incidents`);
  if (viewport.width < 1100) {
    await assertVisible(page.locator(".incident-mobile-toolbar"), `${viewport.label} Incident mobile toolbar`);
    assert.equal(await page.locator(".incident-filter-panel").isVisible().catch(() => false), false, `${viewport.label} should use the Incident filter sheet`);
  }
}

async function checkUsers(page, viewport) {
  if (!await gotoIfAccessible(page, "/admin/users", "Users")) return;
  await assertNoPageOverflow(page, `${viewport.label} Users`);
  if (viewport.width < 1100) {
    await assertVisible(page.locator(".user-card-list"), `${viewport.label} User cards`);
    assert.equal(await page.locator(".admin-users-table").isVisible().catch(() => false), false, `${viewport.label} should not show the Users table`);
  }
}

async function assertNoPageOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${label} should not overflow horizontally`);
}

async function assertVisible(locator, label) {
  assert.equal(await locator.isVisible(), true, `${label} should be visible`);
}
