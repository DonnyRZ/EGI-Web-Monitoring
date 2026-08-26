import assert from "node:assert/strict";
import test from "node:test";
import { buildNavigationCatalog } from "./mobile-navigation";

const base = { isProjectPicDeveloper: false, scopeReady: true };

function keys(items: { key: string }[]) {
  return items.map((item) => item.key);
}

test("superadmin and bos IT use five primary destinations without Incidents", () => {
  const superadmin = buildNavigationCatalog("superadmin", base);
  const bosIt = buildNavigationCatalog("bos_it", base);

  assert.deepEqual(keys(superadmin.primaryNav), ["dashboard", "tasks", "projects", "user-stories", "menu"]);
  assert.deepEqual(keys(bosIt.primaryNav), ["dashboard", "tasks", "projects", "user-stories", "menu"]);
  assert.deepEqual(superadmin.primaryNav.map((item) => item.label), ["Dashboard", "Task", "Project", "User Stories", "Menu"]);
  assert.equal(superadmin.primaryNav.some((item) => item.key === "incidents"), false);
  assert.equal(superadmin.menuNav.some((item) => item.key === "incidents"), true);
  assert.equal(superadmin.menuNav.some((item) => item.key === "users"), true);
  assert.equal(bosIt.menuNav.some((item) => item.key === "users"), false);
});

test("PIC Web gets a compact primary navigation without Incidents", () => {
  const navigation = buildNavigationCatalog("pic_web", { ...base, activeIncidents: 3 });

  assert.deepEqual(keys(navigation.primaryNav), ["dashboard", "tasks", "projects", "menu"]);
  assert.equal(navigation.primaryNav.find((item) => item.key === "menu")?.badge, undefined);
  assert.equal(navigation.desktopNav.some((item) => item.key === "incidents"), false);
  assert.equal(navigation.menuNav.some((item) => item.key === "incidents"), false);
});

test("normal developer does not receive Task Monitoring, while PIC Developer does", () => {
  const developer = buildNavigationCatalog("developer", base);
  const picDeveloper = buildNavigationCatalog("developer", { ...base, isProjectPicDeveloper: true });

  assert.deepEqual(keys(developer.primaryNav), ["dashboard", "my-work", "projects", "user-stories", "menu"]);
  assert.deepEqual(keys(picDeveloper.primaryNav), ["dashboard", "tasks", "my-work", "user-stories", "menu"]);
  assert.deepEqual(developer.primaryNav.map((item) => item.label), ["Dashboard", "Work", "Project", "User Stories", "Menu"]);
  assert.deepEqual(picDeveloper.primaryNav.map((item) => item.label), ["Dashboard", "Task", "Work", "User Stories", "Menu"]);
  assert.deepEqual(keys(developer.menuNav), ["incidents", "logout"]);
  assert.deepEqual(keys(picDeveloper.menuNav), ["projects", "incidents", "logout"]);
  assert.equal(picDeveloper.menuNav[0]?.label, "Project");
  assert.equal(picDeveloper.menuNav[1]?.label, "Insiden");
  assert.equal(picDeveloper.primaryNav.some((item) => item.key === "projects"), false);
  assert.equal(developer.desktopNav.some((item) => item.key === "tasks"), false);
  assert.equal(picDeveloper.desktopNav.some((item) => item.key === "tasks"), true);
  assert.equal(picDeveloper.desktopNav.find((item) => item.key === "tasks")?.label, "Task Monitoring");
});

test("developer navigation stays skeleton-ready until PIC scope resolves", () => {
  const navigation = buildNavigationCatalog("developer", { ...base, scopeReady: false });
  assert.equal(navigation.ready, false);
  assert.equal(navigation.primaryNav.some((item) => item.key === "menu"), true);
});

test("end users have no internal navigation catalog", () => {
  const navigation = buildNavigationCatalog("end_user", base);
  assert.equal(navigation.ready, true);
  assert.deepEqual(navigation.primaryNav, []);
  assert.deepEqual(navigation.menuNav, []);
  assert.deepEqual(navigation.desktopNav, []);
});
