# EGI Web Monitoring production deployment

This runbook implements the controlled, direct-to-production deployment path. It assumes the VPS runs Docker Compose and PostgreSQL on the host. It does not provision GitHub settings, VPS users, DNS, S3 buckets, or Nginx configuration automatically; those one-time prerequisites must be reviewed and completed before the first release.

The deployment unit is the full commit SHA plus four image digests. The release SHA created after deployment hardening is the source of truth; do not deploy the earlier implementation SHA if deployment files have changed after it.

## One-time prerequisites

### GitHub

Create a protected GitHub Environment named production with at least one required reviewer. Configure these repository variables with verified immutable image references:

    NODE_BASE_IMAGE_DIGEST=node:20-bookworm-slim@sha256:<64-hex-digest>
    PLAYWRIGHT_BASE_IMAGE_DIGEST=mcr.microsoft.com/playwright:v1.61.1-noble@sha256:<64-hex-digest>

Protect main and require the CI checks, including the workspace validation job and all four container matrix jobs, before merge.

Configure these production environment secrets:

    DEPLOY_HOST
    DEPLOY_PORT
    DEPLOY_USER
    DEPLOY_SSH_PRIVATE_KEY
    DEPLOY_HOST_FINGERPRINT

DEPLOY_HOST_FINGERPRINT must be the reviewed known_hosts line for the VPS. The workflow never runs ssh-keyscan against an untrusted host.

### VPS deployment identity

Create a dedicated non-root deploy user and install only the public key used by GitHub Actions. Install the wrapper from deploy/egi-web-monitoring-deploy.sh as /usr/local/sbin/egi-web-monitoring-deploy, owned by root, mode 0750, and group-readable/executable only by the deploy group.

Use a narrowly scoped sudoers rule, for example:

    Cmnd_Alias EGI_WEB_MONITORING_DEPLOY = /usr/local/sbin/egi-web-monitoring-deploy
    deployuser ALL=(root) NOPASSWD: EGI_WEB_MONITORING_DEPLOY

The deploy user must not receive a general root shell or unrestricted Docker socket access.

### Application and backup configuration

Copy deploy/env.vps.example to the production .env, replace every placeholder, and set mode 0600. The following values are mandatory before a wrapper preflight can pass:

- IMAGE_REGISTRY and IMAGE_TAG;
- all four application image digest variables;
- REDIS_IMAGE and MINIO_IMAGE with verified @sha256: digests;
- database, JWT, CORS, MinIO, and SMTP settings.

Install deploy/systemd/egi-web-monitoring-backup.env.example as /etc/egi-web-monitoring/backup.env, replace its placeholders, and set mode 0600. It must point to a private S3-compatible bucket with a backup-only credential. Install and enable the systemd service and timer from deploy/systemd/.

The backup command fails closed when BACKUP_S3_REQUIRED=true and the offsite upload, object lookup, checksum, or dump validation fails. Local retention is fourteen days; the offsite lifecycle policy must retain at least thirty days.

### Nginx maintenance mode

Install deploy/nginx/egi-web-monitoring-maintenance.conf as an Nginx snippet and include it inside every public application server block. Install deploy/nginx/egi-maintenance.html at the path referenced by the snippet. Run nginx -t and reload Nginx during a separate low-risk change before the first deployment.

The wrapper can then toggle the exact flag with maintenance-on and maintenance-off. If the snippet is not installed, do not use those actions because the flag will not change public traffic.

## Release workflow

1. Merge to main only after the CI workflow passes. CI validates Prisma, typechecks, runs tests, builds workspaces, validates Compose, builds all four images, scans high/critical vulnerabilities, and uploads SBOM/digest artifacts.
2. Record the four image digests from the CI artifacts. The image tag must be the full commit SHA; latest is never used.
3. Run Deploy production with operation=preflight. It checks the pinned infrastructure image refs, Compose contract, current service state, and the pinned SSH host.
4. Send the internal maintenance notice. This is an operational notice only; there is no user-facing go-live announcement in this phase.
5. Enable maintenance mode and stop only scheduler and worker so no new monitoring jobs run during the migration/backfill window:

       sudo -n /usr/local/sbin/egi-web-monitoring-deploy maintenance-on
       docker compose --env-file /var/www/egi-web-monitoring/.env -f /var/www/egi-web-monitoring/deploy/docker-compose.vps.yml stop scheduler worker

6. Start the backup timer job manually for this deployment and wait for success:

       sudo systemctl start egi-web-monitoring-db-backup.service
       sudo systemctl status --no-pager egi-web-monitoring-db-backup.service
       sudo journalctl -u egi-web-monitoring-db-backup.service -n 100 --no-pager

   From the reported backup ID, verify the local dump is non-empty, pg_restore --list succeeds, SHA256SUMS matches, and the same dump/checksum objects exist in the offsite bucket with matching size. If any check fails, stop the deployment.

7. Run Deploy production with operation=migrate, the four exact digests, and backup_verified=YES. This invokes prisma migrate deploy from the approved backend image only. It does not seed and does not start the application.
8. Run the backfill dry-run from the exact backend image. The command is read-only and writes a JSON report to the protected state directory:

       IMAGE_TAG=<full-commit-sha> docker compose --env-file /var/www/egi-web-monitoring/.env -f /var/www/egi-web-monitoring/deploy/docker-compose.vps.yml run --rm --no-deps --volume /var/lib/egi-web-monitoring:/var/lib/egi-web-monitoring -e PROJECT_BACKFILL_REPORT_FILE=/var/lib/egi-web-monitoring/backfill-<full-commit-sha>.json backend npx tsx apps/backend/scripts/project-backfill.ts

   Review the JSON report. It must have no assignment issues, no project-name conflicts, no ticket/project conflicts, the expected website/project counts, and user_stories_to_create equal to 0. Save the report with the release SHA and backup ID.
9. If the report is approved, run the transaction once with explicit guards:

       IMAGE_TAG=<full-commit-sha> docker compose --env-file /var/www/egi-web-monitoring/.env -f /var/www/egi-web-monitoring/deploy/docker-compose.vps.yml run --rm --no-deps --volume /var/lib/egi-web-monitoring:/var/lib/egi-web-monitoring -e PROJECT_BACKFILL_APPLY=YES -e PROJECT_BACKFILL_BACKUP=VERIFIED -e PROJECT_BACKFILL_REPORT_FILE=/var/lib/egi-web-monitoring/backfill-<full-commit-sha>-apply.json backend npx tsx apps/backend/scripts/project-backfill.ts

   Do not run prisma seed with the backfill. The normal Compose service has no migration or seed startup command.
10. Validate read-only invariants: every existing Website has a Project, active/inactive status mapping is correct, legacy assignment columns are unchanged, invalid users were not assigned, ticket/task counts did not decrease, and no historical User Story was generated.
11. Run Deploy production with operation=deploy, backup_verified=YES, and backfill_verified=YES. The wrapper validates SHA/digests, pulls exact images, saves the previous environment, starts backend/frontend, waits for readiness, starts scheduler/worker, and records deployment logs. The workflow reloads Nginx only after the application rollout passes health checks.
12. Disable maintenance mode:

       sudo -n /usr/local/sbin/egi-web-monitoring-deploy maintenance-off

13. Perform only read-only smoke tests. Check /api/health, /api/health/ready, /login, legacy redirects, HTTPS, role-scoped Project/User Story/Task/Ticket/Incident/Monitoring reads, Redis/MinIO reachability, container restart counts, and recent logs. Do not create Project, assignment, Ticket, User Story, or Task data as part of smoke testing.

Keep the old images, deployment environment snapshot, backup, and backfill reports for at least 72 hours. Observe 5xx rates, readiness, scheduler cadence, worker processing, screenshots/signed URLs, and queue errors for 24–72 hours before declaring the release stable.

## Rollback

For an application-only issue, enable maintenance mode and run Deploy production with operation=rollback and the previously verified SHA plus all four previous image digests. The wrapper does not run a down migration; the Project schema is additive and legacy columns remain available to the old application.

If data damage is suspected, stop writes and restore the verified dump into an isolated PostgreSQL instance first. Validate it there, then perform a separately approved database cutover. Never run pg_restore directly against the active production database and never use a down migration for this release.

## Explicitly out of scope

Notification behavior and notification schema are not changed by this deployment. Production seed is never automatic; any future seed run requires a separate review of every target email, role, active flag, and password.
