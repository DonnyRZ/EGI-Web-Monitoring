import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCheckStatus,
  evaluateIncidentRules,
  isFailureStatus,
} from "./index";

const healthyProbe = {
  httpOk: true,
  httpStatus: 200,
  responseTimeMs: 100,
  errorMessage: null,
};

test("an aborted health probe is unknown and cannot create an incident", () => {
  const status = deriveCheckStatus({
    ...healthyProbe,
    probeAborted: true,
    errorMessage: "Invalid URL",
  });

  assert.equal(status, "unknown");
  assert.equal(isFailureStatus(status), false);
  assert.deepEqual(
    evaluateIncidentRules({ recentStatuses: [status, "unknown"], hasActiveIncident: false }),
    { type: "none" },
  );
});

test("slow warnings do not create an outage incident", () => {
  assert.deepEqual(
    evaluateIncidentRules({ recentStatuses: ["warning", "warning"], hasActiveIncident: false }),
    { type: "none" },
  );
});

test("real consecutive hard failures still create an incident", () => {
  assert.deepEqual(
    evaluateIncidentRules({ recentStatuses: ["down", "down"], hasActiveIncident: false }),
    {
      type: "create_incident",
      severity: "critical",
      titleHint: "Website tidak dapat diakses",
      cardStatus: "down",
    },
  );
});

test("an active incident remains warning during a performance degradation", () => {
  assert.deepEqual(
    evaluateIncidentRules({ recentStatuses: ["warning", "down"], hasActiveIncident: true }),
    { type: "keep_incident", cardStatus: "warning" },
  );
});

test("an active incident stays visible as unknown while the pipeline is unhealthy", () => {
  assert.deepEqual(
    evaluateIncidentRules({ recentStatuses: ["unknown"], hasActiveIncident: true }),
    { type: "keep_incident", cardStatus: "unknown" },
  );
});

test("a healthy probe remains normal", () => {
  assert.equal(deriveCheckStatus(healthyProbe), "normal");
});
