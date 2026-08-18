import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessAllMonitoredResources,
  projectVisibilityWhere,
  websiteVisibilityScope,
} from "./resource-access";
import {
  ALL_RESOURCE_ACCESS_ROLES,
  canAccessAllMonitoredResources as sharedCanAccess,
} from "@egi/shared-types";

test("backend resource access delegates to shared RBAC policy", () => {
  for (const role of ALL_RESOURCE_ACCESS_ROLES) {
    assert.equal(canAccessAllMonitoredResources({ id: "u", email: "u@example.test", role }), true);
    assert.equal(sharedCanAccess(role), true);
  }
  assert.equal(canAccessAllMonitoredResources({ id: "u", email: "u@example.test", role: "end_user" }), false);
  assert.equal(sharedCanAccess("end_user"), false);
});

test("project visibility is scoped by project membership or PIC Developer", () => {
  assert.deepEqual(projectVisibilityWhere({ id: "pic-1", email: "pic@example.test", role: "pic_web" }), {
    members: { some: { userId: "pic-1", memberType: "pic_web" } },
  });
  assert.deepEqual(projectVisibilityWhere({ id: "dev-1", email: "dev@example.test", role: "developer" }), {
    OR: [
      { picDeveloperId: "dev-1" },
      { members: { some: { userId: "dev-1", memberType: "developer" } } },
    ],
  });
  assert.deepEqual(projectVisibilityWhere({ id: "guest-1", email: "guest@example.test", role: "end_user" }), {
    id: "00000000-0000-0000-0000-000000000000",
  });
});

test("website visibility prefers Project assignments while retaining only unbackfilled legacy fallback", () => {
  assert.deepEqual(websiteVisibilityScope({ id: "pic-1", email: "pic@example.test", role: "pic_web" }), {
    OR: [
      { project: { members: { some: { userId: "pic-1", memberType: "pic_web" } } } },
      { projectId: null, ownerId: "pic-1" },
    ],
  });
  assert.deepEqual(websiteVisibilityScope({ id: "dev-1", email: "dev@example.test", role: "developer" }), {
    OR: [
      { project: { picDeveloperId: "dev-1" } },
      { project: { members: { some: { userId: "dev-1", memberType: "developer" } } } },
      { projectId: null, OR: [{ itPicId: "dev-1" }, { backupItPicId: "dev-1" }] },
    ],
  });
});
