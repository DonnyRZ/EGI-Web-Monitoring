# Website Experience and Health Monitoring

Status: **health-only baseline with on-demand Live Website viewer**. Live
interaction is intentionally separate from health monitoring and is loaded
only after an explicit user selection.

## Product boundary

The platform has two independent needs:

1. **Live Website** — a user opens and interacts with the registered URL in
   their own browser.
2. **Health Monitoring** — the platform reports HTTP availability, status,
   latency, incidents, and the latest check.

The background worker implements only the second need. It does not launch a
browser, render a page, capture screenshots, or upload visual evidence.

## Current baseline

- Dashboard shows a lightweight Website Wall with the website identity, direct
  URL action, HTTP health, latest check time, and active incident state.
- Selecting one tile opens one direct Live Website iframe with a bounded
  loading state and a `Buka di tab baru` fallback. Other tiles never load live
  pages in the background.
- Website detail shows current health, HTTP status, response time, errors,
  monitoring history, incidents, and operational tasks.
- Monitoring results no longer expose browser, render, or screenshot fields.
- The worker performs a bounded HTTP GET probe with redirect and target-safety
  validation.
- MinIO remains in the platform only for private ticket attachments. The
  screenshot prefix is not part of the active application contract.
- Scheduler and worker remain opt-in on the constrained production VPS. This
  local preparation does not reactivate them or change production data.

## Health contract

The monitoring result contains only health evidence:

```text
status
http_status
response_time_ms
checked_at
error_message
```

The status is derived from the HTTP probe and the existing consecutive-failure
incident rules. A reachable but slow response is a warning. A failed HTTP
probe is a hard failure for the current check; existing incident rules still
decide when an outage incident is created or recovered.

## Live Website implementation boundary

The Live Website viewer follows these rules:

- Load a site only after the user explicitly selects it.
- Use the registered URL directly in the browser; no server-side proxy is
  involved.
- Keep at most one active iframe on a page.
- Keep a clear `Buka di Tab Baru` fallback for CSP, framing, login, cookie,
  WebSocket, or cross-origin limitations.
- Do not render a gallery of live iframes.
- A Live Website loading or embedding failure must never change health status.
- Health and Live Website errors must be displayed as two different messages.

## Storage boundary

Ticket attachments continue to use the existing private MinIO bucket and
short-lived signed URLs. Any local cleanup of old screenshot objects must be
scoped strictly to the `website/` prefix; `tickets/` objects must never be
deleted by this preparation.

## Non-goals of this baseline

- No new API endpoint for Live Website.
- No per-Website browser, cookie, header, or framing configuration yet.
- No server-side proxy, Playwright, Chromium, screenshot, or visual evidence.
- No Playwright dependency in runtime, CI, E2E, or visual QA.
- No production migration, object deletion, push, or deployment.
- No change to notification behavior, roles, project scope, incident rules,
  or ticket attachment handling.
