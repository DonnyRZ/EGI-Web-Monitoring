import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_RESOURCE_ACCESS_ROLES,
  INCIDENT_MANAGER_ROLES,
  LIFECYCLE_NOTIFICATION_ROLES,
  PLATFORM_ADMIN_ROLES,
  TICKET_ASSIGNEE_ROLES,
  TICKET_MANAGER_ROLES,
  USER_ROLES,
  canAccessAllMonitoredResources,
  canInspectMonitoringDetails,
  canManageIncidents,
  canManagePlatform,
  canManageTickets,
  canViewIncidents,
  isEndUserPublicDashboard,
  isTicketAssigneeCandidate,
  opensWebsiteExternallyFromDashboard,
  receivesLifecycleNotifications,
  roleLabel,
  canViewTasks,
} from "./rbac";

test("USER_ROLES lists the current role model", () => {
  assert.deepEqual([...USER_ROLES], ["end_user", "pic_web", "developer", "bos_it", "superadmin"]);
});

test("platform admin is superadmin only", () => {
  assert.deepEqual([...PLATFORM_ADMIN_ROLES], ["superadmin"]);
  assert.equal(canManagePlatform("superadmin"), true);
  assert.equal(canManagePlatform("developer"), false);
  assert.equal(canManagePlatform("end_user"), false);
  assert.equal(canManagePlatform(null), false);
});

test("global resource / incident view access", () => {
  assert.deepEqual([...ALL_RESOURCE_ACCESS_ROLES], ["superadmin", "bos_it", "developer"]);
  for (const role of ALL_RESOURCE_ACCESS_ROLES) {
    assert.equal(canAccessAllMonitoredResources(role), true);
    assert.equal(canInspectMonitoringDetails(role), true);
    assert.equal(canViewIncidents(role), true);
    assert.equal(canViewTasks(role), true);
  }
  assert.equal(canAccessAllMonitoredResources("pic_web"), false);
  assert.equal(canViewIncidents("pic_web"), false);
  assert.equal(canViewTasks("pic_web"), false);
  assert.equal(canAccessAllMonitoredResources("end_user"), false);
  assert.equal(canViewIncidents("end_user"), false);
  assert.equal(canViewTasks("end_user"), false);
});

test("incident mutate is superadmin only; tickets include operational roles", () => {
  assert.deepEqual([...INCIDENT_MANAGER_ROLES], ["superadmin"]);
  assert.deepEqual([...TICKET_MANAGER_ROLES], ["superadmin", "bos_it", "developer", "pic_web"]);
  assert.equal(canManageIncidents("superadmin"), true);
  assert.equal(canManageIncidents("developer"), false);
  assert.equal(canManageTickets("developer"), true);
});

test("worker assignee and notification role sets", () => {
  assert.deepEqual([...TICKET_ASSIGNEE_ROLES], ["bos_it", "developer"]);
  assert.deepEqual([...LIFECYCLE_NOTIFICATION_ROLES], ["superadmin", "bos_it", "developer"]);
  assert.equal(isTicketAssigneeCandidate("developer"), true);
  assert.equal(receivesLifecycleNotifications("developer"), true);
  assert.equal(receivesLifecycleNotifications("end_user"), false);
});

test("end_user dashboard is a public active-sites gallery", () => {
  assert.equal(isEndUserPublicDashboard("end_user"), true);
  assert.equal(isEndUserPublicDashboard("developer"), false);
  assert.equal(opensWebsiteExternallyFromDashboard("end_user"), true);
  assert.equal(opensWebsiteExternallyFromDashboard("developer"), false);
  assert.equal(opensWebsiteExternallyFromDashboard("superadmin"), false);
});

test("roleLabel covers every USER_ROLES entry", () => {
  for (const role of USER_ROLES) {
    assert.ok(roleLabel(role).length > 0);
  }
});
