# Backend Rays - Database Migration Guide

Panduan pengelolaan migrasi database untuk **Local Development (PostgreSQL)** dan sinkronisasi ke **Production (Hostinger MySQL)**.

---

## 1. Migrasi Database (Local - PostgreSQL)

Local development menggunakan **PostgreSQL** dengan modul migrasi `node-pg-migrate`. File migrasi disimpan secara modular (1 file per tabel) di dalam folder `database/migrations/`.

### Persiapan Environment (`.env`)
Pastikan variabel `DATABASE_URL` sudah dikonfigurasi di root project:

```env
DATABASE_URL=postgres://username:password@localhost:5432/nama_database_local
```

### Perintah Migrasi

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run migrate:up` | Menjalankan seluruh file migrasi yang belum dieksekusi (UP). |
| `npm run migrate:down` | Melakukan rollback / membatalkan migrasi terakhir (DOWN). |
| `npm run migrate:create -- <nama_tabel>` | Membuat file migrasi `.sql` baru secara otomatis dari terminal dengan timestamp. |

#### Contoh Menambah Tabel Baru:
```powershell
npm run migrate:create -- create_notifications_table
```
Perintah di atas akan menghasilkan file baru di `database/migrations/<timestamp>_create-notifications-table.sql`. Anda cukup mengisi query pada bagian `-- Up Migration` dan `-- Down Migration`, lalu jalankan:
```powershell
npm run migrate:up
```

---

## 2. Penggunaan & Sinkronisasi ke MySQL (Production - Hostinger)

Production di Hostinger menggunakan database **MySQL / MariaDB**. Agar tidak perlu menulis ulang query migrasi, project ini dilengkapi script konversi otomatis.

### Alur Ekspor ke MySQL

Kapan pun ada penambahan atau perubahan migrasi di local, jalankan perintah:

```powershell
npm run db:export
```

Script ini akan membaca seluruh migrasi PostgreSQL di `database/migrations/` dan secara otomatis mengonversinya ke sintaks MySQL:
- Mengubah tipe `ENUM` kustom PostgreSQL menjadi inline `ENUM(...)` pada kolom MySQL.
- Mengubah tipe data `SERIAL` &rarr; `INT AUTO_INCREMENT`.
- Mengubah `TIMESTAMP WITH TIME ZONE` &rarr; `TIMESTAMP`.
- Mengubah `JSONB` &rarr; `JSON`.
- Menambahkan konfigurasi `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` dan `SET FOREIGN_KEY_CHECKS`.

Hasil konversi disimpan ke dalam satu file SQL siap pakai:
```
database/hostinger_mysql.sql
```

### Cara Import ke Hostinger (phpMyAdmin)

1. Jalankan `npm run db:export` di komputer lokal Anda.
2. Login ke **cPanel / hPanel Hostinger** &rarr; buka menu **phpMyAdmin**.
3. Pilih database production Anda di bilah kiri.
4. Klik tab **Import** pada navigasi atas.
5. Klik **Choose File / Browse**, lalu pilih file `database/hostinger_mysql.sql`.
6. Klik tombol **Go / Kirim** di bagian bawah halaman.

---

## 3. Pengujian Otomatis dengan Postman (Automated Tests)

Project ini dilengkapi dengan file koleksi Postman yang memiliki fitur **Auto-save Token & OTP** serta pengujian otomatis (*automated assertions*).

### File Postman:
- Koleksi API: `postman_collection.json`
- Environment: `postman_environment.json`

### Cara Menggunakan:
1. Buka aplikasi **Postman** &rarr; klik tombol **Import** di pojok kiri atas.
2. Drag & drop kedua file di atas (`postman_collection.json` dan `postman_environment.json`).
3. Pilih environment **`Backend Rays (Local)`** di dropdown pojok kanan atas Postman.
4. Anda bisa menjalankan request secara berurutan atau klik kanan folder koleksi &rarr; **Run collection** untuk pengujian otomatis seluruh skenario (Register &rarr; OTP &rarr; Login &rarr; Profile &rarr; RBAC 403 Security Check).

---

## 4. Dokumentasi Teknis Tambahan (`/docs`)

Dokumentasi arsitektur dan panduan integrasi modul spesifik tersedia pada folder [`docs/`](file:///c:/Users/USER/Documents/backend-rays/docs):
- [**Panduan Profil, Avatar & Media Upload**](file:///c:/Users/USER/Documents/backend-rays/docs/profile_and_avatar_guide.md): Panduan integrasi upload foto avatar (1-step form-data vs 2-step JSON) dan format `avatar_preview_url` untuk FE.
- [**Integrasi Web Live Chat (Socket.io)**](file:///c:/Users/USER/Documents/backend-rays/docs/live_chat_integration.md): Panduan integrasi event WebSocket dan fallback HTTP untuk widget chat pengunjung dan inbox CS Admin CMS.
- [**Integrasi Google Analytics 4 (GA4)**](file:///c:/Users/USER/Documents/backend-rays/docs/google_analytics_integration.md): Panduan konfigurasi service account dan pengambilan data analitik dashboard CMS.
- [**Tracking Meta Pixel & Conversions API (CAPI)**](file:///c:/Users/USER/Documents/backend-rays/docs/analytics_and_pixel_tracking.md): Panduan server-side event tracking untuk Facebook & Instagram Ads.
- [**Spesifikasi Kalkulator Layanan & Estimasi Harga**](file:///c:/Users/USER/Documents/backend-rays/docs/service_calculator_spec.md): Formula perhitungan harga booking dan detailing service.

