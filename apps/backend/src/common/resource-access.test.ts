import assert from "node:assert/strict";
import test from "node:test";
import { canAccessAllMonitoredResources } from "./resource-access";

test("only operational roles have global monitored-resource access", () => {
  for (const role of ["it_ops", "helpdesk", "developer"]) {
    assert.equal(canAccessAllMonitoredResources({ id: "u", email: "u@example.test", role }), true);
  }
  for (const role of ["business_owner", "end_user"]) {
    assert.equal(canAccessAllMonitoredResources({ id: "u", email: "u@example.test", role }), false);
  }
});
