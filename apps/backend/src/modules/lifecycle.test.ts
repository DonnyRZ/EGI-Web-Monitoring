import assert from "node:assert/strict";
import test from "node:test";
import { IncidentStatus, TicketStatus } from "@egi/database";
import { IncidentsService } from "./incidents/incidents.service";
import { TicketsService } from "./tickets/tickets.service";

test("closed incident cannot change and resolved incident cannot reopen", async () => {
  let incident: { status: IncidentStatus; resolvedAt: Date | null } & Record<string, unknown> = {
    id: "incident", status: IncidentStatus.resolved, resolvedAt: new Date("2026-01-01"),
    title: "x", severity: "high", websiteId: "website", startedAt: new Date(), closedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const service = new IncidentsService({
    incident: {
      findUnique: async () => incident,
      update: async ({ data }: { data: Partial<typeof incident> }) => ({ ...incident, ...data }),
    },
  } as never);

  await assert.rejects(() => service.update("incident", { status: IncidentStatus.open }), /must create a new lifecycle/);
  incident = { ...incident, status: IncidentStatus.closed };
  await assert.rejects(() => service.update("incident", { title: "changed" }), /Closed incidents/);
});

test("resolved ticket cannot reopen and closed ticket cannot change", async () => {
  let ticket: { status: TicketStatus; resolvedAt: Date | null } & Record<string, unknown> = {
    id: "ticket", status: TicketStatus.resolved, resolvedAt: new Date("2026-01-01"),
    title: "x", incidentId: "incident", assignedTo: null, priority: "high",
    createdAt: new Date(), updatedAt: new Date(),
  };
  const service = new TicketsService({
    ticket: {
      findUnique: async () => ticket,
      update: async ({ data }: { data: Partial<typeof ticket> }) => ({ ...ticket, ...data }),
    },
  } as never);

  await assert.rejects(() => service.update("ticket", { status: TicketStatus.open }), /cannot be reopened/);
  ticket = { ...ticket, status: TicketStatus.closed };
  await assert.rejects(() => service.update("ticket", { title: "changed" }), /Closed tickets/);
});
