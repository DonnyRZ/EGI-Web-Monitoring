# EGI Website Monitoring

Internal platform for monitoring EGI websites: availability checks, screenshots, incidents, tickets, and notifications.

## Workspace layout

```text
apps/
  frontend     @egi/frontend    Next.js dashboard
  backend      @egi/backend     NestJS API + Swagger UI
  scheduler    @egi/scheduler   Enqueues monitoring jobs (BullMQ)
  worker       @egi/worker      HTTP + Playwright checks, notifications, retention

packages/
  database          @egi/database
  queue             @egi/queue
  shared-types      @egi/shared-types
  monitoring-rules  @egi/monitoring-rules

Docs/               Product & architecture source of truth
infra/nginx/        Reverse proxy (Docker)
swagger_output.json OpenAPI contract (MVP)
```

## Prerequisites

- Node.js 20+
- npm 10+ (ships with Node; used for workspaces)
- Docker (Postgres, Redis, MinIO)

## Setup

```bash
npm install
cp .env.example .env
npm run infra:up
npm run db:migrate
npm run db:seed
npm run build:database
npm run build -w @egi/shared-types -w @egi/queue -w @egi/monitoring-rules
npm run playwright:install -w @egi/worker
```

Seed login: `admin@egi.co.id` / `Admin123!` (bcrypt; re-seed refreshes the hash).

### Run processes

```bash
# Terminal 1 — API
npm run dev:backend

# Terminal 2 — Next.js dashboard
npm run dev:frontend

# Terminal 3 — scheduler (enqueues every MONITORING_INTERVAL_MINUTES)
npm run dev:scheduler

# Terminal 4 — worker (checks + notifications + retention)
npm run dev:worker
```

- Frontend: `http://localhost:3000`
- API: `http://localhost:3001/api`
- Swagger UI: `http://localhost:3001/docs`
- MinIO console: `http://localhost:9001` (minioadmin / change_me_minio)

### Windows / Playwright

The worker uses Playwright Chromium. After `npm install`, run:

```bash
npm run playwright:install -w @egi/worker
```

If browser launch fails, install [Playwright system deps](https://playwright.dev/docs/browsers) for your OS.

## Scripts

| Command | Description |
|---|---|
| `npm run infra:up` | Start Postgres (5433), Redis, MinIO |
| `npm run infra:down` | Stop infra containers |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed admin + 13 EGI websites (upserts bcrypt admin password) |
| `npm run build:database` | Generate Prisma client + build `@egi/database` |
| `npm run build` | Build database then all packages/apps |
| `npm run dev:backend` | NestJS API + Swagger |
| `npm run dev:frontend` | Next.js dashboard (port 3000) |
| `npm run dev:scheduler` | BullMQ job scheduler |
| `npm run dev:worker` | Monitoring + notification + retention worker |
| `npm run typecheck` | Typecheck all packages/apps |

## Pipeline overview

```text
Scheduler → Redis/BullMQ → Worker (HTTP + Playwright)
  → MinIO screenshot → monitoring_results → rules
  → incidents/tickets → notifications (dashboard/email/Telegram)
```

- Job id: `website_id + scheduled_at` (no duplicate slot)
- Retry: 10s, then 30s, max 3 attempts; jobs older than 4 minutes may skip
- Screenshots: object key `website/{id}/{yyyy}/{mm}/{dd}/{HH-mm}.webp` (UTC); upload failure still saves result with `screenshot_url=null`
- API `GET /monitoring-results/:id/screenshot` returns a short-lived **signed URL** for private MinIO objects
- Retention (daily): monitoring_results 90d, screenshots 30d, notifications 90d; incidents/tickets forever

## Telegram

See `apps/worker/TELEGRAM.md`. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (or per-user `users.telegram_chat_id`). Empty token → notification marked **failed** (not faked as sent). Rate limits / 429 `retry_after` are respected.

## Source of truth

- `Docs/database-schema-website-monitoring-mvp.md`
- `Docs/data-pipeline-blueprint-website-monitoring.md`
- `Docs/EGI Website List.txt`
- `swagger_output.json`
