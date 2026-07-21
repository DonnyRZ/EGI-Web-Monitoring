const { chromium, devices } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = path.join(__dirname, "qa-screenshots");
fs.mkdirSync(OUT, { recursive: true });

const API = "http://localhost:3001/api";
const BASE = "http://localhost:3010";

async function loginApi() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "egi.egiholding@gmail.com", password: "Admin123!" }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status} ${await res.text()}`);
  return res.json();
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("shot", name);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(800);
  await shot(page, "01-login");

  await page.fill("#password", "Admin123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 120000 });
  await page.waitForTimeout(2000);
  await shot(page, "02-dashboard-desktop");

  await page.click('button[aria-label="Notifikasi"]');
  await page.waitForTimeout(1000);
  await shot(page, "03-notifications-open");
  await page.mouse.click(20, 20);
  await page.waitForTimeout(400);

  const card = page.locator(".website-card").first();
  if ((await card.count()) > 0) {
    await card.click();
    await page.waitForURL("**/websites/**", { timeout: 120000 });
    await page.waitForTimeout(2000);
    await shot(page, "04-website-detail");
  } else {
    console.log("no website cards");
  }

  await page.goto(`${BASE}/incidents`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(1200);
  await shot(page, "05-incidents-list");

  const incident = page.locator("a.list-item").first();
  if ((await incident.count()) > 0) {
    await incident.click();
    await page.waitForURL("**/incidents/**", { timeout: 120000 });
    await page.waitForTimeout(1200);
    await shot(page, "06-incident-detail");
  } else {
    console.log("no incidents");
  }

  await page.goto(`${BASE}/admin/websites`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(1200);
  await shot(page, "07-admin-websites");

  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(1200);
  await shot(page, "08-admin-users");

  const mobile = await browser.newContext({
    ...devices["iPhone 12"],
  });
  const mpage = await mobile.newPage();
  const auth = await loginApi();
  await mpage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await mpage.evaluate((a) => {
    localStorage.setItem("egi_access_token", a.access_token);
    localStorage.setItem("egi_refresh_token", a.refresh_token);
    localStorage.setItem("egi_user", JSON.stringify(a.user));
  }, auth);
  await mpage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 180000 });
  await mpage.waitForTimeout(2000);
  await shot(mpage, "09-dashboard-mobile");
  await mpage.click('button[aria-label="Buka menu"]');
  await mpage.waitForTimeout(700);
  await shot(mpage, "10-dashboard-mobile-drawer");

  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.error("QA_FAIL", e);
  process.exit(1);
});
