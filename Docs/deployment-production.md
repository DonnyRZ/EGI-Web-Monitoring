# EGI Web Monitoring production deployment

Public production URL: `https://helloit.egiresources.com`. The `internal.egiresources.com`
name is only a compatibility alias and is not the deployment target.

Runbook deployment langsung ke VPS existing. Aplikasi dibuild dari source release di `/var/www/egi-web-monitoring`; PostgreSQL tetap berjalan sebagai service host, sedangkan Redis dan MinIO tetap menggunakan container serta volume Compose existing.

Deployment ini tidak menggunakan AWS, S3-compatible offsite, GHCR, registry aplikasi, deploy user baru, wrapper root, atau konfigurasi Nginx tambahan. Backup deployment hanya disimpan lokal melalui systemd backup existing.

## Sebelum deployment

1. Pastikan checkout production bersih pada release yang akan dipasang, misalnya `55c1f17`.
2. Pastikan `.env` production yang sudah ada tetap mode `0600`. Jangan mengganti credential database, JWT, SMTP, atau MinIO.
3. Pastikan PostgreSQL host, Redis, MinIO, Nginx, dan HTTPS sedang sehat.
4. Validasi Compose tanpa menyalakan service:

       docker compose --env-file /var/www/egi-web-monitoring/.env -f /var/www/egi-web-monitoring/deploy/docker-compose.vps.yml config --quiet
       docker compose --profile ops --env-file /var/www/egi-web-monitoring/.env -f /var/www/egi-web-monitoring/deploy/docker-compose.vps.yml config --quiet

5. Catat jumlah Website, Ticket, Task, User, dan container lama sebagai baseline rollback.

## Backup lokal

Jalankan backup sebelum maintenance:

    sudo systemctl start egi-web-monitoring-db-backup.service
    sudo systemctl status --no-pager egi-web-monitoring-db-backup.service
    sudo journalctl -u egi-web-monitoring-db-backup.service -n 100 --no-pager

Backup dianggap valid hanya jika dump tidak kosong, mode file ketat, `pg_restore --list` berhasil, dan `SHA256SUMS` cocok. Backup lokal ditahan minimal 14 hari.

## Build dan migration

Build image aplikasi dari source ketika container lama masih aktif agar downtime singkat:

    cd /var/www/egi-web-monitoring
    docker compose --env-file .env -f deploy/docker-compose.vps.yml build backend frontend scheduler worker backend-migrate

Aktifkan maintenance secara operasional dengan menghentikan service aplikasi setelah build selesai. Jangan menghentikan PostgreSQL host, Redis, atau MinIO:

    docker compose --env-file .env -f deploy/docker-compose.vps.yml stop scheduler worker backend frontend

Jalankan migration secara eksplisit dan tanpa seed:

    docker compose --profile ops --env-file .env -f deploy/docker-compose.vps.yml run --rm --no-deps backend-migrate

Migration menggunakan `prisma migrate deploy`. Jangan memakai `db push`, down migration, atau seed otomatis.

## Backfill Project

Jalankan dry-run dari source release sebelum apply. Backend image menyediakan `tsx` pada runtime tooling untuk script backfill:

    docker compose --env-file .env -f deploy/docker-compose.vps.yml run --rm --no-deps backend /opt/egi-runtime/node_modules/.bin/tsx apps/backend/scripts/project-backfill.ts

Review hasilnya. Hentikan deployment jika terdapat assignment issue, inactive user, role mismatch, konflik project/status/ticket, jumlah Website tidak sesuai, atau `user_stories_to_create` bukan `0`.

Jika report valid dan backup sudah diverifikasi, jalankan apply satu kali:

    docker compose --env-file .env -f deploy/docker-compose.vps.yml run --rm --no-deps -e PROJECT_BACKFILL_APPLY=YES -e PROJECT_BACKFILL_BACKUP=VERIFIED backend /opt/egi-runtime/node_modules/.bin/tsx apps/backend/scripts/project-backfill.ts

Backfill berjalan dalam satu transaction. Jangan menjalankan seed bersamaan.

Validasi read-only setelah backfill:

- semua Website existing memiliki Project;
- status active/archived sesuai status Website;
- owner lama menjadi PIC Web;
- IT PIC lama menjadi PIC Developer;
- backup developer hanya menjadi developer team;
- kolom legacy tetap utuh;
- jumlah Ticket dan Task tidak berkurang;
- tidak ada User Story historis otomatis;
- tiket general tetap tanpa Project.

## Rollout

Start service secara berurutan:

    docker compose --env-file .env -f deploy/docker-compose.vps.yml up -d backend
    docker compose --env-file .env -f deploy/docker-compose.vps.yml up -d frontend
    docker compose --env-file .env -f deploy/docker-compose.vps.yml up -d scheduler worker

Tunggu healthcheck backend dan frontend menjadi `healthy`, lalu pastikan scheduler/worker tetap `running` dan tidak restart loop. Nginx existing tidak perlu diubah; reload hanya jika konfigurasi memang berubah.

## Smoke test read-only

Validasi tanpa membuat data baru:

- `/api/health` dan `/api/health/ready`;
- `/login`;
- redirect `/admin/websites` ke `/projects`;
- redirect `/admin/assignments` ke `/projects`;
- scope Project, User Story, Ticket, Incident, Monitoring, dan Legacy Task per role;
- Redis, MinIO untuk lampiran tiket;
- scheduler interval dan worker queue;
- log Prisma, Redis, queue, dan database;
- tidak ada 5xx berulang atau restart loop.

## Rollback

Jika gagal sebelum migration, start kembali container lama. Jika migration atau backfill gagal sebelum commit, transaction harus rollback otomatis dan jangan retry sebelum analisis.

Jika aplikasi baru unhealthy setelah migration/backfill, kembalikan image/container aplikasi ke image lokal sebelumnya. Jangan menjalankan down migration; schema Project bersifat additive dan kolom legacy tetap ada.

Jika dicurigai ada kerusakan data, hentikan write dan restore dump ke database terisolasi terlebih dahulu. Jangan menjalankan `pg_restore` langsung ke database production aktif.

Notification dan production seed tetap di luar deployment ini.
