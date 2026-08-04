import assert from "node:assert/strict";
import test from "node:test";
import { canAccessAllMonitoredResources } from "./resource-access";
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
