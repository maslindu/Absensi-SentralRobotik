# Cara Menjalankan — Sistem Presensi & Monitoring Robotik Soloraya

Panduan langkah demi langkah menyiapkan & menjalankan sistem. Ikuti berurutan. File pendukung: `schema.sql`, `storage_policies.sql`, `README.md`.

---

## 0. Prasyarat

- **Node.js** 18+ dan npm/pnpm.
- Akun **Supabase** (gratis cukup untuk mulai) — https://supabase.com
- (Opsional) **Supabase CLI** untuk deploy Edge Function: `npm i -g supabase`.
- Git.

---

## 1. Buat Proyek Supabase

1. Login ke dashboard Supabase → **New project**.
2. Catat **Project URL**, **anon key**, dan **service_role key** (Settings → API). Simpan aman; `service_role` **tidak boleh** bocor ke frontend.
3. Pilih region terdekat (mis. Singapore) agar cepat dari Indonesia.

---

## 2. Terapkan Skema Database

1. Buka **SQL Editor** di dashboard Supabase.
2. Salin seluruh isi **`schema.sql`** → jalankan (Run).
   - Skema ini sudah teruji jalan tanpa error di PostgreSQL 16, lengkap dengan tabel, trigger otomatis (nomor pertemuan, auto-seed presensi, batas foto, proteksi role), fungsi & policy RLS.
3. Salin seluruh isi **`storage_policies.sql`** → jalankan. Ini membuat bucket privat `meeting-documentation` dan policy-nya.

Verifikasi: di **Table Editor** harus muncul 12 tabel (`roles`, `profiles`, `academic_terms`, `schools`, `classes`, `teacher_assignments`, `students`, `enrollments`, `meetings`, `meeting_photos`, `attendance`, `export_logs`).

---

## 3. Buat Admin Pertama

Karena RLS mengunci hampir semua operasi ke role tertentu, buat satu admin manual dulu:

1. **Authentication → Users → Add user** (isi email & password). Salin **User UID**-nya.
2. Buka **SQL Editor**, jalankan (ganti UID & nama):
   ```sql
   insert into profiles (id, role_id, full_name)
   values (
     'PASTE-USER-UID-DI-SINI',
     (select id from roles where name = 'admin'),
     'Nama Admin'
   );
   ```
3. Buat juga minimal satu **tahun ajaran aktif** agar sistem bisa dipakai:
   ```sql
   insert into academic_terms (year_label, semester, is_active)
   values ('2026/2027', 'ganjil', true);
   ```

> Setelah aplikasi jalan, admin bisa membuat user guru/ketua lewat UI. Pola pembuatan user: buat akun di Supabase Auth (via Admin API dari server) lalu insert baris `profiles` dengan `role_id` yang sesuai.

---

## 4. Siapkan Proyek Next.js

```bash
npx create-next-app@latest robotik-presensi --typescript --tailwind --app --eslint
cd robotik-presensi
npm install @supabase/supabase-js @supabase/ssr
```

Buat file **`.env.local`** di root:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```

> `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai di server (route handler / Edge Function). Jangan diawali `NEXT_PUBLIC_`.

Buat client Supabase (browser & server) sesuai pola resmi `@supabase/ssr`:
- `lib/supabase/client.ts` → `createBrowserClient(...)`
- `lib/supabase/server.ts` → `createServerClient(...)` dengan cookies
- `middleware.ts` → refresh sesi + guard rute per role

(Struktur folder lengkap ada di `README.md` bagian 6.)

---

## 5. Generate Tipe TypeScript (disarankan)

```bash
npx supabase login
npx supabase gen types typescript --project-id <PROJECT_ID> > lib/types.ts
```

Pakai tipe ini di semua query Supabase agar type-safe.

---

## 6. Jalankan Development Server

```bash
npm run dev
```

Buka http://localhost:3000 → login dengan admin yang dibuat di langkah 3.

Alur uji cepat:
1. Login admin → buat sekolah → kelas → guru → siswa → enroll siswa ke kelas+semester → penugasan guru.
2. Login sebagai guru → buat laporan pertemuan → cek presensi ter-generate otomatis → ubah yang tidak hadir → upload foto.
3. Login sebagai ketua → cek semua data muncul read-only.

---

## 7. (Opsional) Edge Function Export .xlsx

Untuk rekap bulanan yang bisa diunduh:

```bash
supabase functions new export-monthly
```

Di dalam function (Deno): pakai `service_role` (dari `Deno.env`), jalankan dua query rekap di `README.md` bagian 12, susun ke `.xlsx` (mis. lib `xlsx`/`exceljs`), lalu kembalikan file atau simpan ke Storage & catat di `export_logs`.

```bash
supabase functions deploy export-monthly
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...   # jika perlu
```

Panggil dari halaman `/reports` (tombol "Export Bulan Ini"). Integrasi Google Sheets API bisa ditambahkan belakangan tanpa mengubah database.

---

## 8. Deploy ke Produksi

1. Push repo ke GitHub.
2. Import ke **Vercel** → set environment variables yang sama dengan `.env.local`.
3. Deploy. Supabase (DB/Auth/Storage/Functions) sudah cloud, jadi frontend Vercel langsung terhubung.

---

## 9. Troubleshooting

| Gejala | Kemungkinan sebab & solusi |
|---|---|
| Query mengembalikan kosong padahal data ada | RLS menolak — pastikan user punya baris `profiles` dengan `role_id` benar, dan (untuk guru) ada `teacher_assignments` di kelas+semester itu |
| "new row violates row-level security policy" saat insert | Role tidak berhak; cek policy di `README.md` bagian 3 & 7 |
| Nomor pertemuan tidak muncul / null | Jangan kirim `meeting_number` dari frontend; biarkan trigger mengisi. Ambil ulang baris meeting setelah insert (`.select().single()`) |
| Presensi tidak ter-generate | Pastikan siswa punya `enrollments` aktif di kelas+semester dengan `start_date <= meeting_date` |
| Foto ke-3 ditolak | Memang dibatasi maks 2 per pertemuan (by design) |
| Foto tidak bisa dibuka | Bucket privat — tampilkan lewat signed URL, bukan URL publik |
| Guru bisa lihat kelas yang bukan miliknya | Cek `teacher_assignments` & policy `meetings_select` |

---

## Ringkasan Perintah Cepat

```bash
# Setup proyek
npx create-next-app@latest robotik-presensi --typescript --tailwind --app
cd robotik-presensi
npm install @supabase/supabase-js @supabase/ssr

# Tipe DB
npx supabase gen types typescript --project-id <ID> > lib/types.ts

# Jalankan
npm run dev

# (Opsional) Edge Function
supabase functions new export-monthly
supabase functions deploy export-monthly
```

Skema database (`schema.sql`) & storage (`storage_policies.sql`) dijalankan lewat **SQL Editor** di dashboard Supabase (langkah 2).
