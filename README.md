# EGI Website Monitoring

Internal platform for monitoring EGI websites: HTTP health checks, incidents, tickets, and notifications.

## Workspace layout

```text
apps/
  frontend     @egi/frontend    Next.js dashboard
  backend      @egi/backend     NestJS API + Swagger UI
  scheduler    @egi/scheduler   Enqueues monitoring jobs (BullMQ)
  worker       @egi/worker      HTTP health checks, notifications, retention

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
```

Seed logins default to admin `egi.egiholding@gmail.com`, Bos IT `bos.it@egiresources.com`,
PIC Web `pic.web@egiresources.com`, and developer `donny@egiresources.com`, all using
`Admin123!` unless overridden by the corresponding `SEED_*_PASSWORD` variables. The
13 seeded websites are owned by PIC Web and assigned to the seeded developer; re-seed
keeps existing passwords and preserves deliberate manual assignments.

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

- Frontend: `http://localhost:3010` (Makka Hotel uses port 3000)
- API: `http://localhost:3001/api`
- Swagger UI: `http://localhost:3001/docs`
- MinIO console: `http://localhost:9001` (minioadmin / change_me_minio)

### Monitoring model

The background worker performs lightweight HTTP health checks only. Live Website
interaction is an explicit user action: the dashboard opens one direct iframe at
a time and keeps a tab-new fallback when framing is blocked. The VPS does not
render, proxy, or screenshot every website. MinIO remains available for private
ticket attachments.

## Deploy to a VPS (Windows or Linux)

The application runs on both Windows and Linux VPSes. Keep Postgres, Redis,
and MinIO bound to loopback as in `docker-compose.yml`; expose only the
frontend/API through a reverse proxy with HTTPS. On the VPS, set
`NODE_ENV=production`, a public `CORS_ORIGINS` value, and unique values for
`DATABASE_URL`, `REDIS_PASSWORD`, both JWT secrets, and both S3 credentials.
The backend, worker, and scheduler intentionally refuse unsafe default
credentials in production. Set `ENABLE_SWAGGER=false` unless docs need
controlled access. The worker validates every monitoring target and HTTP
redirect to prevent private-network monitoring requests.

`infra/nginx/nginx.conf` is a working reverse-proxy template for containerized
frontend/backend services. Validate it with `nginx -t`, replace the upstream
hosts with `127.0.0.1` when the apps run directly on the VPS, and add the TLS
certificate configuration before public exposure.

For the controlled Docker/Compose production path, use [Docs/deployment-production.md](Docs/deployment-production.md). It requires immutable image digests, a verified local/offsite PostgreSQL backup, explicit migration/backfill gates, and a protected GitHub production environment.

## Scripts

| Command | Description |
|---|---|
| `npm run infra:up` | Start Postgres (5433), Redis, MinIO |
| `npm run infra:down` | Stop infra containers |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed admin, Bos IT, PIC Web, developer, guest, and 13 EGI websites |
| `npm run build:database` | Generate Prisma client + build `@egi/database` |
| `npm run build` | Build database then all packages/apps |
| `npm run dev:backend` | NestJS API + Swagger |
| `npm run dev:frontend` | Next.js dashboard (port 3010) |
| `npm run dev:scheduler` | BullMQ job scheduler |
| `npm run dev:worker` | Monitoring + notification + retention worker |
| `npm run typecheck` | Typecheck all packages/apps |

## Pipeline overview

```text
Scheduler → Redis/BullMQ → Worker (HTTP health check)
  → monitoring_results → rules
  → incidents/tickets → notifications (dashboard/email/Telegram)
```

- Job id: `website_id + scheduled_at` (no duplicate slot)
- Retry: 10s, then 30s, max 3 attempts; jobs older than 4 minutes may skip
- Retention (daily): monitoring_results 90d, notifications 90d; incidents/tickets forever

## Telegram

See `apps/worker/TELEGRAM.md`. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (or per-user `users.telegram_chat_id`). Empty token → notification marked **failed** (not faked as sent). Rate limits / 429 `retry_after` are respected.

## Source of truth

- `Docs/database-schema-website-monitoring-mvp.md`
- `Docs/data-pipeline-blueprint-website-monitoring.md`
- `Docs/EGI Website List.txt`
- `swagger_output.json`
- `Docs/website-experience-separation.md` — preparation boundary for Live Website and Health Monitoring

## Deep API tests

`apps/backend/scripts/api-deep-test.mjs` writes users, websites, monitoring
results, incidents, tickets, and notifications. It is deliberately blocked from
running with defaults. Run it only against a dedicated database whose name
contains `test` and a backend process configured to use that same database.
