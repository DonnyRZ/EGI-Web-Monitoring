import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!baseURL || !email || !password) {
  console.log("SKIP project-settings E2E: set E2E_BASE_URL, E2E_EMAIL, and E2E_PASSWORD for an isolated local app.");
  process.exit(0);
}

const parsedBaseURL = new URL(baseURL);
if (!new Set(["127.0.0.1", "localhost"]).has(parsedBaseURL.hostname)) {
  throw new Error("Refusing to run lifecycle E2E outside localhost/127.0.0.1");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);

  await page.goto(`${baseURL}/projects/project-1`, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "PIC & Assignment", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "assignment page should not overflow horizontally");

  await page.getByRole("button", { name: "Kelola PIC Web", exact: true }).click();
  const picWebDialog = page.getByRole("dialog", { name: "Kelola PIC Web" });
  await assertVisible(picWebDialog, "PIC Web picker");
  await picWebDialog.getByPlaceholder("Cari nama atau email…").fill("tidak-ada-anggota");
  await assertVisible(picWebDialog.getByText("Tidak ada anggota ditemukan"), "empty roster search state");
  await picWebDialog.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(await page.getByRole("dialog", { name: "Kelola PIC Web" }).count(), 0);

  await page.getByRole("button", { name: "Kelola Developer Team", exact: true }).click();
  const teamDialog = page.getByRole("dialog", { name: "Kelola Developer Team" });
  await assertVisible(teamDialog, "Developer Team picker");
  await assertVisible(teamDialog.getByRole("button", { name: "Terpilih", exact: true }), "selected filter");
  await assertVisible(teamDialog.getByRole("button", { name: "Ada overdue", exact: true }), "overdue filter");
  await teamDialog.getByRole("button", { name: "Batal", exact: true }).click();

  await page.getByRole("button", { name: /(?:Pilih|Ganti) PIC Developer/ }).click();
  const picDeveloperDialog = page.getByRole("dialog", { name: "Pilih PIC Developer" });
  await assertVisible(picDeveloperDialog, "PIC Developer picker");
  await assertVisible(picDeveloperDialog.getByRole("button", { name: "Belum ditentukan", exact: true }), "optional PIC Developer choice");
  await picDeveloperDialog.getByRole("button", { name: "Batal", exact: true }).click();

  await page.getByRole("button", { name: "Pengaturan Project" }).click();

  const dialog = page.getByRole("dialog", { name: "Pengaturan Project" });
  await assertVisible(dialog, "Pengaturan Project dialog");
  await assertVisible(dialog.getByRole("group", { name: "Informasi Project" }), "Informasi Project section");
  await assertVisible(dialog.getByRole("group", { name: "Status Project" }), "Status Project section");

  await dialog.getByLabel("Nama Project").fill("Project E2E berubah");
  await dialog.getByLabel("Status").click();
  await page.getByRole("option", { name: "Archived" }).click();

  const archiveConfirmation = dialog.locator(".project-status-confirmation");
  await assertVisible(archiveConfirmation, "archive confirmation");
  await assertVisible(archiveConfirmation.getByText(/Masih ada .*Task aktif/i), "active work warning");
  assert.equal(await dialog.getByRole("button", { name: "Simpan Perubahan" }).isDisabled(), true);

  await dialog.getByRole("button", { name: "Ya, arsipkan Project" }).click();
  assert.equal(await dialog.getByRole("button", { name: "Simpan Perubahan" }).isDisabled(), false);

  const updateResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/projects/project-1") && response.request().method() === "PATCH" && response.ok(),
  );
  await dialog.getByRole("button", { name: "Simpan Perubahan" }).click();
  await updateResponse;
  await assertVisible(page.getByText("Archived", { exact: true }).first(), "archived Project status");

  let closeDialogMessage = "";
  await page.getByRole("button", { name: "Pengaturan Project" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "Pengaturan Project" });
  page.once("dialog", async (nativeDialog) => {
    closeDialogMessage = nativeDialog.message();
    await nativeDialog.dismiss();
  });
  await reopenedDialog.getByLabel("Deskripsi").fill("Perubahan yang belum disimpan");
  await reopenedDialog.getByRole("button", { name: "Batal" }).click();
  assert.match(closeDialogMessage, /belum disimpan/i);
  await assertVisible(reopenedDialog, "dialog remains open after guarded cancel");

  page.once("dialog", async (nativeDialog) => {
    await nativeDialog.accept();
  });
  await reopenedDialog.getByRole("button", { name: "Batal" }).click();

  await page.goto(`${baseURL}/tasks`, { waitUntil: "domcontentloaded" });
  await assertVisible(page.getByLabel("Filter Project"), "Project filter");
  await assertVisible(page.getByLabel("Filter Website"), "Website filter");
  await page.getByRole("button", { name: "Buat Task" }).click();
  const taskDialog = page.getByRole("dialog", { name: "Buat Task" });
  await assertVisible(taskDialog, "Buat Task dialog");
  assert.equal(await taskDialog.getByLabel("Task ini untuk").textContent(), "Website tertentu");
  await assertVisible(taskDialog.getByLabel("Project"), "Project selector for project scope");
  await assertVisible(taskDialog.getByLabel("Website"), "Website selector for website scope");

  await taskDialog.getByLabel("Project").click();
  await page.getByRole("option", { name: "Project E2E" }).click();
  await taskDialog.getByLabel("Website").click();
  await page.getByRole("option", { name: "Website E2E" }).click();

  await taskDialog.getByLabel("Task ini untuk").click();
  await page.getByRole("option", { name: "Seluruh Project" }).click();
  assert.equal(await taskDialog.getByLabel("Website").count(), 0);
  await taskDialog.getByLabel("Task ini untuk").click();
  await page.getByRole("option", { name: "Website tertentu" }).click();
  await assertVisible(taskDialog.getByLabel("Website"), "Website selector after returning to website scope");

  await taskDialog.getByLabel("Kategori").click();
  await page.getByRole("option", { name: "Help Desk" }).click();
  await taskDialog.getByLabel("Task ini untuk").click();
  await page.getByRole("option", { name: "Task Umum" }).click();
  assert.equal(await taskDialog.getByLabel("Project").count(), 0);
  assert.equal(await taskDialog.getByLabel("Website").count(), 0);

  console.log("PASS project-settings lifecycle and task-scope E2E");
} finally {
  await browser.close();
}

async function assertVisible(locator, label) {
  assert.equal(await locator.isVisible(), true, `${label} should be visible`);
}
