import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!baseURL || !email || !password) {
  console.log("SKIP task-monitoring overview E2E: set E2E_BASE_URL, E2E_EMAIL, and E2E_PASSWORD for an isolated local app.");
  process.exit(0);
}

const parsedBaseURL = new URL(baseURL);
if (!new Set(["127.0.0.1", "localhost"]).has(parsedBaseURL.hostname)) {
  throw new Error("Refusing to run Task Monitoring E2E outside localhost/127.0.0.1");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);

  await page.goto(`${baseURL}/tasks`, { waitUntil: "domcontentloaded" });
  await assertVisible(page.getByRole("heading", { name: "Ringkasan pekerjaan" }), "overview heading");
  await assertVisible(page.getByLabel("Filter Project"), "Project filter");
  await assertVisible(page.getByLabel("Filter Website"), "Website filter");
  await assertVisible(page.getByLabel("Filter Developer"), "Developer filter");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "overview should not overflow horizontally");
  assert.equal(await page.locator(".task-monitoring-row").count(), 0, "the overview should not render a flat Task list");

  const projectRows = page.locator(".task-overview-table-row");
  if (await projectRows.count() > 0) {
    await projectRows.first().click();
    const drawer = page.getByRole("dialog", { name: /Task pada/ });
    await assertVisible(drawer, "Project Task drawer");
    await assertVisible(drawer.getByLabel("Cari Task"), "Task search in drawer");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "drawer should not overflow horizontally");

    const taskRows = drawer.locator(".task-drawer-row");
    if (await taskRows.count() > 0) {
      await taskRows.first().click();
      await assertVisible(drawer.getByText("Kembali ke Project", { exact: false }), "Task detail back action");
      await drawer.getByRole("button", { name: /Kembali ke Project/ }).click();
      await assertVisible(drawer.getByLabel("Cari Task"), "Project Task list after back");
    }
    await drawer.getByRole("button", { name: /Tutup detail Project/ }).click();
    assert.equal(await page.getByRole("dialog", { name: /Task pada/ }).count(), 0, "drawer should close cleanly");
  }

  console.log("PASS Task Monitoring overview and drill-down E2E");
} finally {
  await browser.close();
}

async function assertVisible(locator, label) {
  assert.equal(await locator.isVisible(), true, `${label} should be visible`);
}
