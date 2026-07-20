# Audit Masalah Backend EGI Web Monitoring

Dokumen ini merangkum temuan audit backend, data pipeline, worker, scheduler, storage, autentikasi, dan infrastruktur aplikasi EGI Web Monitoring. Setiap temuan menjelaskan gejala, akar masalah, dampak, solusi, contoh teknis, dan pencegahan regresi.

## 1. Isolasi data berdasarkan pemilik atau scope akses

### Masalah

Endpoint website, monitoring result, dashboard, incident, dan ticket berisiko mengembalikan data lintas scope jika query hanya menggunakan `id`.

```ts
return prisma.website.findUnique({ where: { id } });
```

Query tersebut membuktikan record ada, tetapi tidak membuktikan user yang login berhak membacanya.

### Dampak

- User dapat menebak UUID lalu membaca website milik scope lain.
- Monitoring result, screenshot, incident, dan ticket dapat bocor melalui endpoint detail.
- Filter list terlihat benar, tetapi endpoint detail menjadi jalur bypass.

### Solusi

Scope akses diterapkan pada seluruh jalur baca dan tulis. Controller meneruskan user ke service, lalu service membentuk predicate akses sebelum query.

```ts
const website = await prisma.website.findFirst({
  where: {
    id,
    ...resourceScopeFor(user),
  },
});

if (!website) throw new NotFoundException("Website tidak ditemukan");
```

Pola yang sama dipakai pada list/detail website, dashboard website, monitoring result, screenshot, incident, ticket, update, close, deactivate, dan delete. Mengembalikan `404` untuk resource di luar scope juga mencegah endpoint membocorkan apakah UUID sebenarnya ada.

### Pencegahan regresi

Test akses harus mencakup dua user dengan scope berbeda. User A harus mendapat `200` untuk resource miliknya dan `404` atau `403` untuk resource milik User B pada endpoint list, detail, update, dan delete.

## 2. Validasi URL monitoring dan SSRF

### Masalah

Aplikasi menerima URL dari user lalu melakukan request HTTP atau membuka browser. URL yang tidak divalidasi dapat memaksa server mengakses jaringan internal.

Contoh target berbahaya:

```text
http://127.0.0.1:3001/api/auth/me
http://169.254.169.254/latest/meta-data/
http://10.0.0.5/internal-dashboard
http://[::1]:6379/
```

### Dampak

- SSRF ke API internal, database proxy, Docker service, atau metadata cloud.
- Pemindaian jaringan internal dari worker.
- Redirect domain publik ke alamat private melewati validasi awal.
- DNS rebinding mengubah target setelah pemeriksaan pertama.

### Solusi

Validator memeriksa protocol `http/https`, hostname, credential URL, port, hasil DNS, loopback, private/link-local/multicast/reserved address, redirect, serta target browser. Pemeriksaan dilakukan lagi pada setiap redirect dan pada jalur worker maupun browser.

```text
https://example.com                    -> diizinkan
http://localhost:3001                  -> ditolak
http://127.0.0.1:9000                  -> ditolak
http://169.254.169.254                 -> ditolak
https://example.com -> 10.0.0.8        -> ditolak
```

Test `monitoring-url.test.ts` dan `target-safety.test.ts` mencakup IPv4, IPv6, hostname private, encoded host, port eksplisit, dan redirect.

## 3. Scheduler, queue, dan duplikasi job

### Masalah

Scheduler menghasilkan job berdasarkan interval monitoring, sedangkan worker mengambil job dari queue. Tanpa lock, idempotency, dan batas waktu, dua tick scheduler atau dua worker dapat memproses website yang sama.

### Dampak

- Dua hasil monitoring untuk satu jadwal.
- Beban request dan browser meningkat.
- Incident dibuat atau diperbarui dua kali.
- Retry lama dapat menimpa hasil yang lebih baru.

### Solusi

- Scheduler memakai distributed lock dengan TTL.
- Job memakai deduplication key.
- Worker menghormati attempts, backoff, timeout, dan status job.
- Job terlalu terlambat dilewati berdasarkan `LATE_JOB_SKIP_MS`.
- Concurrency worker dibatasi.
- Hasil menyimpan waktu mulai/selesai dan tidak membiarkan hasil lama menimpa hasil baru.

Contoh key:

```text
monitor:{websiteId}:{scheduledBucket}
```

Dua tick dalam bucket yang sama hanya boleh menghasilkan satu job.

## 4. Timeout HTTP dan browser probe

### Masalah

Target bisa lambat, tidak merespons, atau membuat koneksi menggantung. Tanpa timeout berlapis, satu probe menahan worker terlalu lama.

### Solusi

Timeout dipisahkan untuk HTTP request, browser launch, page navigation, screenshot, queue job, retry, dan backoff. Timeout dipetakan menjadi hasil terstruktur, bukan exception tanpa status.

```json
{
  "status": "down",
  "error_code": "BROWSER_TIMEOUT",
  "duration_ms": 45000
}
```

## 5. Incident dan ticket harus idempotent

### Masalah

Retry hasil `down` dapat membuat incident atau ticket duplikat jika setiap event selalu melakukan insert baru.

### Solusi

Gunakan website, rule, dan incident state sebagai kunci idempotensi. Update incident terbuka yang sudah ada, validasi transisi status, simpan state utama sebelum side effect, dan jangan membuka kembali incident yang sudah ditutup tanpa hasil monitoring baru yang valid.

## 6. Notifikasi dan retry delivery

### Masalah

Email, Telegram, dan notifikasi dashboard adalah side effect. Retry tanpa rekonsiliasi menyebabkan notifikasi hilang atau terkirim ganda.

### Solusi

Simpan status `pending/sent/failed`, jumlah percobaan, dan event key. Pisahkan status incident dari status delivery. Sediakan reconciliation untuk item gagal/stale dan validasi response provider.

## 7. Retention data dan screenshot

### Masalah

Hasil monitoring dan screenshot tumbuh terus. Menghapus row tanpa object storage membuat orphan object; menghapus object dulu dapat memutus histori sebelum row dibersihkan.

### Solusi

Retention berjalan batch: pilih data kedaluwarsa, tangani object screenshot, hapus row sesuai kebijakan, catat sukses/gagal, dan retry item gagal. Proses memakai batch size, timeout, dan lock.

## 8. S3/MinIO dan screenshot private

### Masalah

Screenshot internal tidak boleh public dan credential storage tidak boleh dikirim ke frontend.

### Solusi

Bucket private, backend membuat signed URL berumur pendek, endpoint screenshot memeriksa scope monitoring result, dan credential hanya berada di backend/worker.

## 9. Refresh token dan cookie autentikasi

### Masalah

Refresh token di localStorage dapat dibaca JavaScript saat XSS. Frontend juga dapat gagal refresh jika backend mengharapkan cookie tetapi client hanya mengirim body token.

### Solusi

Refresh token memakai HttpOnly/Secure/SameSite cookie sesuai environment, access token berumur pendek, refresh token dirotasi, cookie dibersihkan saat logout/gagal, dan endpoint refresh tidak boleh masuk loop retry.

```text
access token valid  -> /auth/me
access expired      -> /auth/refresh dengan cookie
refresh sukses      -> simpan access token baru
refresh gagal       -> bersihkan session dan login ulang
```

## 10. Default development terbawa ke production

### Masalah

Credential `change_me_*`, JWT secret lemah, Swagger terbuka, CORS longgar, atau Redis/S3 default berbahaya di VPS production.

### Solusi

Runtime config menolak database credential default, JWT secret pendek/default, S3 credential default, CORS kosong/wildcard yang tidak disengaja, dan Swagger terbuka tanpa keputusan eksplisit.

```env
NODE_ENV=production
DATABASE_URL=postgresql://egi:<strong-password>@postgres:5432/egi_monitoring
JWT_ACCESS_SECRET=<random-secret-min-32-chars>
JWT_REFRESH_SECRET=<different-random-secret-min-32-chars>
CORS_ORIGINS=https://monitoring.example.com
```

## 11. Port, container, dan reverse proxy

### Masalah

Port `3000` sudah dipakai Makka Hotel. EGI di port sama menyebabkan konflik atau aplikasi yang terbuka bukan EGI.

### Solusi

Konfigurasi EGI saat ini:

```text
Frontend: 3010
Backend:  3001
Postgres: 5433 host -> container
Redis:    6379
MinIO:    9000/9001
```

Di VPS, hanya reverse proxy yang membuka HTTPS 443. Frontend/backend internal tidak perlu dibuka publik. Nginx menerapkan rate limit dan header keamanan.

## 12. Database connection warm-up

### Masalah

`$connect()` saja belum selalu membuat pool menyelesaikan query pertama sebelum request halaman datang. Beberapa request API cold yang berjalan bersamaan masih membayar biaya inisialisasi/query database.

### Solusi

Prisma service menjalankan query ringan saat startup:

```ts
await this.$connect();
await this.$queryRaw`SELECT 1`;
```

Dashboard cold terukur sekitar 117 ms setelah warm-up; request berurutan berikutnya berada sekitar 28–47 ms untuk endpoint list utama.

## 13. Verifikasi backend

Audit API mendalam mencapai `75/75` skenario lulus. Typecheck backend juga lulus setelah database warm-up. Area yang dicakup: autentikasi, scope akses, website, monitoring result, dashboard, incident, ticket, notification, SSRF, scheduler, worker, retention, S3, dan lifecycle.

Test harus dijalankan ulang setiap kali controller, service, worker, scheduler, atau runtime configuration berubah.

