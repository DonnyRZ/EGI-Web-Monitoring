# Production Logging

## Format

Backend, worker, dan scheduler menulis satu JSON object per baris ke stdout/stderr. Field utama:

```json
{
  "timestamp": "2026-07-20T12:00:00.000Z",
  "level": "info",
  "service": "backend",
  "message": "http_request",
  "request_id": "req-123",
  "method": "GET",
  "path": "/api/dashboard",
  "status_code": 200,
  "duration_ms": 84
}
```

Credential, password, authorization header, cookie, access token, refresh token, dan secret otomatis diganti menjadi `[REDACTED]`.

## Melihat log Docker

```bash
docker compose logs -f backend
docker compose logs --since 24h worker
docker logs --tail 500 egi-scheduler
```

Cari error atau request tertentu:

```bash
docker compose logs backend | grep '"level":"error"'
docker compose logs backend | grep '"request_id":"req-123"'
```

Di PowerShell, gunakan:

```powershell
docker compose logs backend | Select-String '"level":"error"'
```

## Rotasi

Compose menggunakan Docker `local` logging driver dengan maksimum 50 MB per file dan 10 file rotasi. Ini membatasi penggunaan disk sekitar 500 MB per container. Untuk histori lebih panjang, kirim stdout Docker ke Loki/Grafana, Elasticsearch, atau syslog host.

## Event penting

Backend mencatat:

- `service_ready`;
- `http_request`;
- `auth_login_success`;
- `auth_login_failed`;
- `auth_refresh_failed`;
- `auth_refresh_replay_rejected`;
- `auth_logout`.

Worker dan scheduler mempertahankan event pipeline seperti `job_started`, `job_completed`, `job_failed`, `scheduler_tick`, `job_created`, retry, retention, notification, dan shutdown.

## Request ID

Backend menerima `X-Request-ID` yang aman atau membuat UUID baru. Response mengembalikan `X-Request-ID`, sehingga operator dapat mencari semua log untuk satu request.

## Batasan

Docker log rotation menyimpan histori operasional jangka pendek. Aktivitas bisnis/security yang wajib diaudit sebaiknya disimpan sebagai audit record di database atau sistem log terpusat, bukan hanya mengandalkan file log container. Jangan mengubah log menjadi file di dalam container karena file tersebut dapat hilang saat container dibuat ulang.

