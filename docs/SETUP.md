# Cara Menjalankan — Sistem Presensi & Monitoring Robotik Soloraya

Panduan langkah demi langkah menyiapkan & menjalankan proyek **yang sudah ada di repo ini** (bukan proyek kosong). File pendukung: `supabase/schema.sql`, `supabase/storage_policies.sql`, `README.md`.

---

## 0. Prasyarat

- **Node.js** 18+ dan npm.
- Akun **Supabase** (tier gratis cukup untuk mulai) — https://supabase.com
- Git.

---

## 1. Clone & Install

```bash
git clone <url-repo-ini>
cd "Absensi Sentral Robotik"
npm install
```

Proyek sudah berupa aplikasi Next.js 16 (App Router) yang lengkap — bukan perlu `create-next-app` lagi. Struktur folder ada di `README.md` §6.

---

## 2. Buat Proyek Supabase

1. Login ke dashboard Supabase → **New project**.
2. Catat **Project URL**, **anon key**, dan **service_role key** (Settings → API). Simpan aman; `service_role` **tidak boleh** bocor ke frontend/browser.
3. Pilih region terdekat (mis. Singapore) agar cepat dari Indonesia.

---

## 3. Terapkan Skema Database

1. Buka **SQL Editor** di dashboard Supabase.
2. Salin seluruh isi **`supabase/schema.sql`** → jalankan (Run).
   - Skema ini sudah teruji jalan tanpa error di PostgreSQL, lengkap dengan tabel, trigger otomatis (nomor pertemuan, auto-seed presensi, batas foto, proteksi role), fungsi & policy RLS. Role yang dibuat hanya **admin** dan **guru**.
3. Salin seluruh isi **`supabase/storage_policies.sql`** → jalankan. Ini membuat bucket privat `meeting-documentation` dan policy-nya.

Verifikasi: di **Table Editor** harus muncul 12 tabel (`roles`, `profiles`, `academic_terms`, `schools`, `classes`, `teacher_assignments`, `students`, `enrollments`, `meetings`, `meeting_photos`, `attendance`, `export_logs`).

> Jika kamu mewarisi database lama yang masih punya role `ketua` (versi sebelum role itu dihapus), jalankan juga `supabase/migrations/remove_ketua.sql` setelah memindahkan akun ber-role ketua ke `admin` (instruksinya ada di komentar file tersebut).

---

## 4. Buat Admin Pertama

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

> Setelah aplikasi jalan, admin membuat akun guru lewat UI (`/admin/teachers` → Tambah Guru). Halaman itu memanggil `POST /api/admin/users`, yang membuat user di Supabase Auth lewat `service_role` lalu insert baris `profiles` dengan `role_id` guru — semua otomatis, tidak perlu SQL manual lagi untuk guru berikutnya.

---

## 5. Isi Environment Variables

Buat/lengkapi file **`.env.local`** di root proyek (kalau belum ada, copy dari contoh berikut):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```

> `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai di server (`lib/supabase/admin.ts`, diimpor dari `app/api/**/route.ts`). Jangan diawali `NEXT_PUBLIC_`, dan jangan pernah diimpor dari client component.

`.env.local` sudah ada di `.gitignore` — nilai asli tidak pernah ter-commit.

---

## 6. Jalankan Development Server

```bash
npm run dev
```

Buka http://localhost:3000 → login dengan admin yang dibuat di langkah 4.

Alur uji cepat:
1. Login admin → buat sekolah → kelas → guru (`/admin/teachers`) → siswa (manual atau **Import Excel** di `/admin/students`) → enroll siswa ke kelas+semester → penugasan guru (`/admin/assignments`).
2. Login sebagai guru → `/teacher/meetings/new` → buat laporan pertemuan → cek presensi ter-generate otomatis → ubah yang tidak hadir → coba tambah siswa baru langsung dari layar ini → upload foto.
3. Kembali sebagai admin → `/monitor` cek laporan tadi muncul & bisa difilter → `/reports` pilih bulan yang sama → klik **Export Excel** → pastikan file `.xlsx` terunduh dengan 4 sheet terisi.

---

## 7. Generate Tipe TypeScript (opsional, saat skema berubah)

```bash
npx supabase login
npx supabase gen types typescript --project-id <PROJECT_ID> > lib/types.ts
```

Saat ini `lib/types.ts` ditulis manual mengikuti `supabase/schema.sql`. Kalau kamu menjalankan generator ini, tinjau ulang hasilnya (nama relasi hasil join seperti `schools:school_id(name)` biasanya perlu disesuaikan manual) sebelum menimpa file yang ada.

---

## 8. Deploy ke Produksi

1. Push repo ke GitHub (kalau belum).
2. Import ke **Vercel** → set environment variables yang sama dengan `.env.local` (termasuk `SUPABASE_SERVICE_ROLE_KEY` sebagai server-side env var, bukan `NEXT_PUBLIC_`).
3. Deploy. Supabase (DB/Auth/Storage) sudah cloud, jadi frontend Vercel langsung terhubung. Tidak ada komponen backend lain yang perlu dideploy terpisah — export `.xlsx` dan pembuatan akun guru berjalan sebagai Route Handler di dalam aplikasi Next.js yang sama.

---

## 9. Troubleshooting

| Gejala | Kemungkinan sebab & solusi |
|---|---|
| Query mengembalikan kosong padahal data ada | RLS menolak — pastikan user punya baris `profiles` dengan `role_id` benar, dan (untuk guru) ada `teacher_assignments` di kelas+semester itu |
| "new row violates row-level security policy" saat insert | Role tidak berhak; cek policy di `README.md` §3 & §7–8 |
| Nomor pertemuan tidak muncul / null | Jangan kirim `meeting_number` dari frontend; biarkan trigger mengisi. Ambil ulang baris meeting setelah insert (`.select().single()`) |
| Presensi tidak ter-generate | Pastikan siswa punya `enrollments` aktif di kelas+semester dengan `start_date <= meeting_date` dan `end_date` kosong/≥ tanggal pertemuan |
| Foto ke-3 ditolak | Memang dibatasi maks 2 per pertemuan (by design, trigger `enforce_photo_limit`) |
| Foto tidak bisa dibuka | Bucket privat — tampilkan lewat signed URL, bukan URL publik |
| `POST /api/admin/users` atau `/api/export` selalu 403 | Endpoint ini cek role admin manual di server (bukan cuma RLS) — pastikan yang login benar-benar punya `profiles.role_id` = admin dan `is_active = true` |
| Import Excel siswa gagal / kolom salah | Pastikan kolom A = nama lengkap, kolom B = NIS (opsional); lihat contoh di `public/template-import-siswa.xlsx` |
| Guru bisa lihat kelas yang bukan miliknya | Cek `teacher_assignments` & policy `meetings_select` di `supabase/schema.sql` |
| Error terkait konvensi Next.js yang terasa "beda dari biasanya" | Proyek ini pakai Next.js 16 dengan beberapa breaking change dari versi lama (mis. `proxy.ts` menggantikan `middleware.ts`) — cek `node_modules/next/dist/docs/` sebelum mengasumsikan perilaku versi lama, lihat `AGENTS.md` |

---

## Ringkasan Perintah Cepat

```bash
# Install
npm install

# Tipe DB (opsional, saat skema berubah)
npx supabase gen types typescript --project-id <ID> > lib/types.ts

# Jalankan
npm run dev

# Build produksi (opsional, untuk cek sebelum deploy)
npm run build
```

Skema database (`supabase/schema.sql`) & storage (`supabase/storage_policies.sql`) dijalankan lewat **SQL Editor** di dashboard Supabase (langkah 3). Tidak ada Edge Function yang perlu dideploy.
