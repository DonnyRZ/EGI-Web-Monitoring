import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_RESOURCE_ACCESS_ROLES,
  INCIDENT_MANAGER_ROLES,
  LIFECYCLE_NOTIFICATION_ROLES,
  PLATFORM_ADMIN_ROLES,
  TICKET_ASSIGNEE_ROLES,
  TICKET_MANAGER_ROLES,
  TASK_CREATOR_ROLES,
  PROJECT_ADMIN_ROLES,
  USER_STORY_MANAGER_ROLES,
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
  canViewDeveloperWorkload,
  canCreateTasks,
  canManageProjects,
  canViewProjectRegistry,
  canManageUserStories,
  canViewUserStories,
  canCreateTaskIntake,
  canViewTaskMonitoring,
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
  assert.equal(canViewIncidents("pic_web"), true);
  assert.equal(canViewTasks("pic_web"), true);
  assert.equal(canViewDeveloperWorkload("pic_web"), true);
  assert.equal(canAccessAllMonitoredResources("end_user"), false);
  assert.equal(canViewIncidents("end_user"), false);
  assert.equal(canViewTasks("end_user"), false);
  assert.equal(canViewDeveloperWorkload("end_user"), false);
});

test("incident mutate is superadmin only; tickets include operational roles", () => {
  assert.deepEqual([...INCIDENT_MANAGER_ROLES], ["superadmin"]);
  assert.deepEqual([...TICKET_MANAGER_ROLES], ["superadmin", "bos_it", "developer", "pic_web"]);
  assert.equal(canManageIncidents("superadmin"), true);
  assert.equal(canManageIncidents("developer"), false);
  assert.equal(canManageTickets("developer"), true);
});

test("task creation includes Bos IT delegation and developer self-service", () => {
  assert.deepEqual([...TASK_CREATOR_ROLES], ["superadmin", "bos_it", "developer"]);
  assert.equal(canCreateTasks("superadmin"), true);
  assert.equal(canCreateTasks("bos_it"), true);
  assert.equal(canCreateTasks("developer"), true);
  assert.equal(canCreateTasks("pic_web"), false);
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

test("project and user story capability sets keep pic_developer project-scoped", () => {
  assert.deepEqual([...PROJECT_ADMIN_ROLES], ["superadmin", "bos_it"]);
  assert.deepEqual([...USER_STORY_MANAGER_ROLES], ["superadmin", "bos_it", "developer"]);
  assert.equal(canManageProjects("developer"), false);
  assert.equal(canManageProjects("bos_it"), true);
  assert.equal(canViewProjectRegistry("pic_web"), true);
  assert.equal(canViewProjectRegistry("end_user"), false);
  assert.equal(canManageUserStories("developer"), true);
  assert.equal(canViewUserStories("developer"), true);
  assert.equal(canViewUserStories("pic_web"), false);
});

test("business Task intake and unified monitoring have the intended role split", () => {
  assert.equal(canCreateTaskIntake("superadmin"), true);
  assert.equal(canCreateTaskIntake("bos_it"), true);
  assert.equal(canCreateTaskIntake("pic_web"), true);
  assert.equal(canCreateTaskIntake("developer"), false);
  assert.equal(canCreateTaskIntake("end_user"), false);

  for (const role of ["superadmin", "bos_it", "pic_web", "developer"]) {
    assert.equal(canViewTaskMonitoring(role), true);
  }
  assert.equal(canViewTaskMonitoring("end_user"), false);
});
