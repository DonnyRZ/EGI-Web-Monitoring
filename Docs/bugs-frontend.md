# Audit Masalah Frontend EGI Web Monitoring

Dokumen ini merangkum temuan audit frontend dari login sampai dashboard, detail website, incidents, detail incident, Kelola Website, Users, dan notifications. Fokus audit: loading, navigasi, autentikasi, request API, cache, dan perbedaan `next dev` dengan production.

## 1. Halaman menggantung di “Memuat…”

### Masalah

`AuthProvider` memulai `loading = true`, lalu menunggu refresh atau `/auth/me`. Sebelum perbaikan, fetch tidak memiliki timeout. Jika backend mati, port salah, DNS lambat, atau koneksi menggantung, `finally` tidak pernah dicapai dan seluruh `AppShell` hanya merender:

```tsx
if (loading || !user) {
  return <div>Memuat…</div>;
}
```

### Dampak

- Login terlihat kosong.
- Dashboard tidak pernah sampai memuat datanya.
- User tidak mendapat pesan bahwa backend tidak tersedia.

### Solusi

Semua request frontend memiliki timeout 10 detik. Refresh gagal/timeout membersihkan storage dan mengarahkan user ke login. Default API memakai `127.0.0.1:3001`, menghindari resolusi `localhost` yang pada environment ini lebih lambat.

```text
backend hidup + session valid  -> render aplikasi
backend hidup + session invalid -> login
backend mati                   -> gagal maksimal 10 detik
```

## 2. Session valid masih menunggu validasi

### Masalah

Saat reload, cached user dan access token sudah tersedia, tetapi aplikasi tetap menunggu `/auth/me` sebelum merender shell.

### Solusi

Jika cached user dan access token tersedia, `AuthProvider` langsung merender menggunakan cached session. Validasi `/auth/me` tetap berjalan di background. Jika token invalid, session dibersihkan dan redirect dilakukan.

Ini membuat reload terasa instant tanpa menghapus validasi server.

## 3. `next dev` mengompilasi route saat pertama dibuka

### Masalah

Mode sebelumnya:

```text
next dev -p 3010
```

Mode dev mengompilasi route saat route pertama kali dikunjungi. Pengukuran menunjukkan startup sekitar 37–62 detik, compile dashboard sekitar 28–76 detik, dan route berikutnya beberapa detik. Inilah penyebab klik Dashboard, Incidents, Kelola Website, atau Users terasa hang 30 detik sampai 1 menit.

### Solusi

Build dilakukan sekali lalu hasilnya dijalankan dengan:

```text
next build
next start -p 3010
```

Hasil route production:

| Route | Waktu |
| --- | ---: |
| `/login` | ±220 ms |
| `/dashboard` | ±37 ms |
| `/incidents` | ±44 ms |
| `/admin/websites` | ±25 ms |
| `/admin/users` | ±33 ms |
| Detail website | ±132 ms |
| Detail incident | ±43 ms |

`next dev` tetap cocok untuk coding dan hot reload, tetapi bukan ukuran performa preview atau production.

## 4. Artefak `.next` rusak karena build dan dev berjalan bersamaan

### Masalah

`next build` dan `next dev` pernah menulis/membaca folder `.next` secara bersamaan. Log menunjukkan:

```text
Cannot find module './997.js'
ENOENT: routes-manifest.json
```

### Dampak

- Route mengembalikan HTTP 500.
- Frontend terlihat listen, tetapi halaman tetap error.
- Masalah tampak seperti bug React padahal artefak build tertimpa.

### Solusi

Hentikan frontend sebelum build, hapus hanya `apps/frontend/.next` jika korup, jalankan build sampai selesai, lalu jalankan `next start`. Build dan dev tidak boleh berbagi output directory bersamaan.

## 5. Request global berulang saat navigasi

### Masalah

`AppShell` mengambil active incidents setiap perubahan `pathname`. Karena setiap route membuat shell baru, pindah halaman mengulang request yang sama.

`NotificationBell` juga mengambil notifications saat mount walaupun panel belum dibuka.

### Dampak

Request tambahan berjalan bersamaan dengan data halaman. Pada database cold, ini memperbesar delay dashboard dan page transition.

### Solusi

- Active incidents di-cache 30 detik.
- Fetch active incidents tidak lagi bergantung pada perubahan pathname.
- Notifications dimuat saat panel dibuka.
- Polling notifications hanya berjalan setelah fitur digunakan.

## 6. Navigasi terlihat tidak berpindah karena shell menunggu auth

### Masalah

```tsx
if (loading || !user) return <LoadingState />;
```

Jika auth state di-reset atau request auth tertahan, seluruh halaman diganti loading screen. User merasa link tidak bekerja, padahal route transition sudah dimulai.

### Solusi

- Cached session langsung mempertahankan shell.
- API request mempunyai timeout.
- Session invalid diarahkan ke login.
- Request badge incidents dan notifications tidak memblokir children utama.

## 7. Loading state halaman terlalu kosong

### Masalah

Dashboard, incidents, admin websites, dan users mengambil data dengan `useEffect`, lalu menampilkan `LoadingState` sampai request selesai. Ini valid secara fungsional, tetapi cold database membuat halaman terlihat seperti hang.

### Solusi dan rekomendasi

Solusi yang sudah diterapkan adalah API timeout, production server, database warm-up, dan pengurangan request global. Tahap lanjutan yang direkomendasikan adalah skeleton yang mempertahankan layout dan cache client:

```tsx
{loading ? <DashboardCardSkeleton count={6} /> : <DashboardCards data={cards} />}
```

Saat filter berubah, data lama juga dapat dipertahankan sampai data baru siap agar UI tidak berkedip kembali ke layar kosong.

## 8. Halaman Incidents mengambil dua sumber data

### Masalah

Incidents mengambil daftar website untuk filter/label dan daftar incidents secara terpisah. Dua request dapat berjalan bersamaan pada first visit.

### Solusi

Request memiliki timeout dan tidak menggantung. Optimasi lanjutan adalah mengembalikan ringkasan website dari endpoint incidents atau memakai cache website list yang sudah digunakan dashboard/admin.

## 9. Detail website dan incident memiliki loading mandiri

### Masalah

Route detail mengambil data setelah komponen mount. Dalam mode dev, compile route dan request data terjadi berurutan, sehingga total delay sangat besar.

### Solusi

Production build menghilangkan compile-on-demand. Endpoint detail juga telah diverifikasi cepat. Screenshot dimuat terpisah melalui signed URL sehingga kegagalan storage tidak memblokir seluruh detail.

## 10. API client dan refresh loop

### Masalah

Request 401 perlu melakukan refresh, tetapi refresh yang diperlakukan seperti request biasa dapat memicu loop tanpa akhir.

### Solusi

Refresh memakai `auth: false` dan `skipRefresh: true`. Hanya satu `refreshPromise` berjalan dalam satu waktu. Jika refresh gagal, storage dibersihkan dan request tidak dicoba ulang tanpa batas.

```text
request 401 -> satu kali refresh -> retry satu kali
refresh gagal -> clear session -> login
```

## 11. Ukuran bundle bukan bottleneck utama

Production build menghasilkan:

```text
First Load JS shared by all: sekitar 103 kB
Route page: sekitar 2–4 kB
```

Jadi delay 30–75 detik bukan karena bundle terlalu besar. Bottleneck utamanya adalah compile-on-demand `next dev`, auth bootstrap yang sebelumnya dapat menggantung, request global berulang, dan cold-start backend/database.

## 12. Audit semua halaman dan API

Route yang diaudit:

- login;
- dashboard;
- klik card website dan detail website;
- incidents dan detail incident;
- Kelola Website;
- Users;
- kembali ke Dashboard;
- notifications.

Hasil validasi:

- frontend typecheck lulus;
- frontend production build lulus;
- backend typecheck lulus;
- seluruh route utama berstatus HTTP 200;
- production frontend error log kosong;
- login API berstatus 200 dan mengembalikan access token;
- dashboard, incidents, websites, users API berstatus 200;
- detail website dan detail incident berstatus 200;
- `git diff --check` tidak menemukan whitespace error.

## 13. Pencegahan regresi

1. Gunakan `next dev` hanya saat mengedit kode.
2. Gunakan `next build` lalu `next start` untuk preview performa.
3. Jangan menjalankan build dan dev bersamaan.
4. Pertahankan timeout API.
5. Tambahkan browser smoke test untuk login dan seluruh navigasi utama.
6. Ukur waktu dari klik sampai content utama terlihat, bukan hanya status HTTP route.
7. Pisahkan cold-start API dan warm API dalam benchmark.
8. Pertahankan cache data global yang tidak perlu diambil ulang pada setiap route.
9. Gunakan skeleton untuk mengganti layar loading kosong.

