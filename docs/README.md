# Sistem Presensi & Monitoring Pengajar — Komunitas Robotik Soloraya

> **Untuk AI coding agent / developer:** Dokumen ini adalah *single source of truth* teknis untuk sistem yang **sudah dibangun** di repo ini (bukan lagi rencana). Baca sampai selesai sebelum mengubah kode. Skema database final ada di `supabase/schema.sql` (disalin identik ke `docs/schema.sql` untuk referensi cepat). Cara setup ada di `SETUP.md`.
>
> **Peringatan versi Next.js:** proyek ini memakai Next.js 16 (App Router) yang punya beberapa perubahan breaking dari versi lama yang mungkin ada di data latih model AI. Yang paling penting: **file middleware bernama `proxy.ts`**, bukan `middleware.ts`, dan fungsinya diekspor dengan nama `proxy` (`export async function proxy(...)`). Sebelum menulis kode yang berkaitan dengan konvensi Next.js, cek dulu `node_modules/next/dist/docs/`.

---

## 1. Ringkasan Proyek

Aplikasi web (responsive, dipakai di HP & laptop) untuk mencatat kegiatan mengajar ekstrakurikuler robotik di banyak sekolah. Sistem merekam: kehadiran & materi tiap pertemuan, guru yang benar-benar mengajar, presensi siswa, dan foto dokumentasi. Admin memakainya untuk monitoring seluruh kegiatan, dan tiap bulan data direkap & diunduh sebagai file Excel langsung dari aplikasi.

**Prinsip inti:**
- Database aplikasi (Supabase Postgres) = sumber kebenaran. File `.xlsx` hanya **output laporan**, bukan sumber data.
- Nomor pertemuan **reset tiap semester**, dihitung **otomatis** server-side (trigger DB).
- Siswa bisa masuk/keluar di tengah semester tanpa merusak histori presensi.
- Data master **tidak dihapus permanen** — cukup dinonaktifkan / diberi `end_date`.
- Keamanan ditegakkan oleh **Row Level Security (RLS)** di database, bukan hanya di frontend.

---

## 2. Lingkup

### Termasuk (sudah berjalan)
Login & role, CRUD sekolah/kelas/guru/siswa, import siswa massal dari Excel, penugasan guru, tahun ajaran & semester, laporan pertemuan (nomor otomatis), guru utama vs guru pelaksana, presensi siswa (auto-seed + edit), tambah/keluarkan siswa langsung dari layar presensi, upload dokumentasi (maks 2 foto, bucket privat), monitoring seluruh pertemuan oleh admin, dan export rekap bulanan ke `.xlsx` langsung dari browser.

### Tidak termasuk (di luar cakupan saat ini)
Penilaian akademik, pembayaran, manajemen kurikulum, aplikasi Android native (cukup responsive web), jadwal/kalender akademik penuh & deteksi pertemuan bolong, notifikasi WhatsApp, dashboard statistik/grafik, integrasi Google Sheets.

---

## 3. Peran Pengguna & Hak Akses

Sistem punya **2 peran**. Role `ketua` sudah dihapus (lihat `supabase/migrations/remove_ketua.sql`) — semua kebutuhan monitoring/rekap read-only sekarang tercakup di role `admin`.

| Peran | Ringkasan | Hak |
|---|---|---|
| **Admin** | Mengelola semua data & memonitor | CRUD sekolah, kelas, guru (akun + reset password), siswa, penugasan, tahun ajaran; melihat seluruh laporan pertemuan (`/monitor`); membuat & mengunduh rekap bulanan (`/reports`) |
| **Guru** | Mengisi laporan mengajar & kelola roster kelasnya | Login; lihat kelas yang dia ampu; buat/ubah laporan pertemuan; isi presensi; upload foto; **menambah/mengeluarkan siswa (enrollment) untuk kelas yang ditugaskan padanya** — termasuk saat pertemuan berlangsung; lihat riwayat mengajarnya |

Aturan akses ini **diterjemahkan menjadi RLS di `supabase/schema.sql`** — jangan menegakkan otorisasi hanya di frontend. Route group (`app/(app)/admin/layout.tsx`, `.../monitor/layout.tsx`, `.../reports/layout.tsx`) melakukan pengecekan role di server sebagai lapisan UX tambahan (redirect ke `/dashboard` bila bukan admin), tapi RLS tetap pengaman utama.

---

## 4. Arsitektur

```
┌──────────────┐     ┌────────────────────────────────────────┐
│   Next.js 16 │     │              Supabase                  │
│ (App Router) │────▶│  Auth  ·  PostgreSQL (RLS)  ·  Storage │
│  TypeScript  │     │                                        │
│  Tailwind v4 │     │                                        │
└──────────────┘     └────────────────────────────────────────┘
        │                                   │
        └─── Supabase JS client (RLS aktif) ┘
```

**Keputusan arsitektur (penting):**
- **Tidak pakai Laravel / backend terpisah.** Untuk skala komunitas ini, backend terpisah cuma menambah beban hosting & pemeliharaan. Frontend berbicara langsung ke Supabase memakai `@supabase/supabase-js` (lewat `@supabase/ssr` di server); keamanan dijaga RLS.
- **Auth = Supabase Auth** (email/password). Tabel `profiles` menautkan `auth.users` ke `roles`. **Tidak ada** kolom password di tabel aplikasi.
- **Logika sensitif** (nomor pertemuan, auto-seed presensi, batas foto, proteksi role) berada di **trigger/fungsi PostgreSQL**, bukan di frontend — supaya tidak bisa dilewati.
- **Tidak ada Supabase Edge Function.** Operasi yang butuh `service_role` (buat/reset akun guru, export bulanan) dijalankan lewat **Next.js Route Handler** (`app/api/**/route.ts`), berjalan di server Next.js (Vercel), bukan Deno Edge Function. Ini lebih sederhana untuk skala proyek ini dan tidak butuh deploy terpisah.
- **Proxy/middleware** (`proxy.ts` di root) hanya menangani refresh sesi Supabase + redirect optimistik (belum login → `/login`, sudah login & buka `/login` → `/dashboard`). Guard per-role dilakukan di `layout.tsx` masing-masing route group karena butuh query `profiles.role_id`, yang lebih murah dilakukan di server component daripada di proxy.

---

## 5. Tech Stack

| Lapisan | Pilihan | Catatan |
|---|---|---|
| Framework | **Next.js 16 (App Router) + TypeScript**, React 19 | lihat `package.json`; proxy file = `proxy.ts` |
| Styling | **Tailwind CSS v4** | komponen custom di `components/ui.tsx` (tanpa shadcn/ui) |
| Ikon | **lucide-react** | |
| Auth | **Supabase Auth** | email/password |
| Database | **Supabase PostgreSQL** | skema di `supabase/schema.sql` |
| Client DB | **@supabase/supabase-js** + **@supabase/ssr** | 3 client: browser, server (cookies), admin (service role) |
| Storage | **Supabase Storage** | bucket privat `meeting-documentation`, policy di `supabase/storage_policies.sql` |
| Export & admin ops | **Next.js Route Handler** (`app/api/export`, `app/api/admin/users`) | pakai `xlsx` npm package, jalan di Node.js runtime |
| Deploy | **Vercel** (frontend + route handler) + Supabase (Auth/DB/Storage) | |

---

## 6. Struktur Folder (sesuai repo saat ini)

```
.
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                # cek sesi, render AppShell (sidebar per role)
│   │   ├── dashboard/page.tsx        # ringkasan; konten beda utk admin vs guru
│   │   ├── admin/
│   │   │   ├── layout.tsx            # guard: hanya role admin
│   │   │   ├── terms/page.tsx        # tahun ajaran & semester
│   │   │   ├── schools/page.tsx
│   │   │   ├── classes/page.tsx
│   │   │   ├── teachers/page.tsx     # buat akun guru, reset password, nonaktifkan
│   │   │   ├── students/page.tsx     # CRUD siswa + enrollment + import Excel
│   │   │   └── assignments/page.tsx  # penugasan guru utama per kelas/term
│   │   ├── teacher/
│   │   │   ├── layout.tsx            # guard: butuh sesi (admin boleh bantu masuk)
│   │   │   ├── students/page.tsx     # roster kelas yang diampu
│   │   │   └── meetings/
│   │   │       ├── page.tsx          # daftar pertemuan guru
│   │   │       ├── new/page.tsx      # form laporan baru (alur §9.1)
│   │   │       └── [id]/page.tsx     # detail + edit presensi & foto
│   │   ├── monitor/
│   │   │   ├── layout.tsx            # guard: hanya admin
│   │   │   └── page.tsx              # daftar semua pertemuan, filter, read-only
│   │   └── reports/
│   │       ├── layout.tsx            # guard: hanya admin
│   │       └── page.tsx              # rekap on-screen + tombol export .xlsx
│   ├── api/
│   │   ├── admin/users/route.ts      # POST buat akun guru, PATCH reset password
│   │   └── export/route.ts           # GET .xlsx rekap bulanan (Node runtime)
│   └── layout.tsx / page.tsx / globals.css
├── components/
│   ├── app-shell.tsx                 # sidebar desktop + bottom-nav mobile per role
│   ├── attendance-editor.tsx
│   ├── photo-uploader.tsx
│   ├── logout-button.tsx
│   ├── toast.tsx
│   └── ui.tsx                        # PageHeader, Modal, Field, badges, dst.
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # createBrowserClient
│   │   ├── server.ts                 # createServerClient (cookies, App Router)
│   │   └── admin.ts                  # createAdminClient (service_role — server only)
│   ├── auth.ts                       # getSessionInfo(), getActiveTerm()
│   ├── format.ts                     # termLabel, formatDateShort, todayISO, dst.
│   └── types.ts                      # tipe TS manual mengikuti schema.sql
├── proxy.ts                          # refresh sesi + redirect optimistik (bukan middleware.ts!)
├── supabase/
│   ├── schema.sql                    # sumber kebenaran skema (identik dgn docs/schema.sql)
│   ├── storage_policies.sql          # bucket + policy storage
│   └── migrations/
│       └── remove_ketua.sql          # migrasi hapus role ketua (jalankan manual bila DB lama)
├── public/
│   └── template-import-siswa.xlsx    # contoh format import siswa
├── .env.local
└── package.json
```

---

## 7. Model Data (ringkasan; detail penuh di `supabase/schema.sql`)

Relasi inti:

```
roles ──< profiles (=auth.users)                    -- roles: admin, guru
schools ──< classes ──< enrollments >── students
academic_terms ──< enrollments
academic_terms ──< teacher_assignments >── profiles(guru) ── classes/schools
academic_terms ──< meetings >── classes/schools
profiles(guru) ──< meetings (scheduled_teacher_id / actual_teacher_id)
meetings ──< attendance >── students
meetings ──< meeting_photos
```

Tabel & peran singkat:

| Tabel | Fungsi |
|---|---|
| `roles` | admin / guru (role `ketua` sudah dihapus) |
| `profiles` | data user, tertaut `auth.users`, punya `role_id` |
| `academic_terms` | tahun ajaran + semester (ganjil/genap); jangkar nomor pertemuan & enrollment |
| `schools` | sekolah mitra |
| `classes` | kelas per sekolah (nama bebas per sekolah) |
| `teacher_assignments` | guru **utama** per kelas per semester |
| `students` | identitas siswa (tidak dihapus, hanya nonaktif) |
| `enrollments` | siswa ada di kelas mana pada semester mana (`start_date`/`end_date`) |
| `meetings` | satu baris per pertemuan; `scheduled_teacher_id` vs `actual_teacher_id`; `meeting_number` otomatis |
| `attendance` | presensi per siswa per pertemuan; menyimpan **snapshot nama** |
| `meeting_photos` | dokumentasi (maks 2, simpan **path** storage) |
| `export_logs` | audit setiap kali file `.xlsx` bulanan diunduh |

### Perilaku otomatis yang WAJIB dipahami sebelum koding

1. **Nomor pertemuan otomatis.** Jangan pernah kirim `meeting_number` dari frontend. Trigger `set_meeting_number` mengisinya = max+1 dalam scope `(class_id, term_id)`, dikunci pakai `pg_advisory_xact_lock` agar aman dari race condition. Reset ke 1 tiap ganti semester.
2. **Presensi auto-seed.** Begitu `meetings` di-INSERT, trigger `seed_attendance` otomatis membuat baris `attendance` berstatus `hadir` untuk **semua siswa yang aktif ter-enroll** di kelas+semester itu pada `meeting_date`. Alur frontend: buat meeting → **fetch ulang** baris `attendance` → guru tinggal mengubah yang tidak `hadir`.
   - **Tambah siswa saat pertemuan berlangsung:** seeding hanya jalan saat meeting dibuat. Kalau guru menambah siswa ke kelas *setelah* meeting ada (form `/teacher/meetings/new` menyediakan tombol tambah siswa inline setelah meeting tersimpan), aplikasi harus: (a) buat `students` bila baru, (b) buat `enrollments` di kelas itu, lalu (c) **insert satu baris `attendance` untuk meeting yang sedang berjalan** (status `hadir`, isi `student_name_snapshot`). Enrollment saja tidak menambah presensi ke meeting yang sudah ada.
3. **Snapshot nama.** `attendance.student_name_snapshot` diisi saat seeding. Rekap lama tetap benar walau nama/kelas siswa berubah kemudian.
4. **Batas 2 foto.** Trigger `enforce_photo_limit` menolak foto ke-3 per pertemuan; UI (`photo-uploader.tsx`) juga menonaktifkan tombol upload setelah 2 foto.
5. **Proteksi role.** Trigger `protect_profile_privileges` mencegah non-admin mengubah `role_id`/`is_active` miliknya sendiri lewat policy `profiles_update_self`.

---

## 8. Aturan Bisnis

- Satu pertemuan tepat **satu** `actual_teacher_id` (guru pelaksana).
- `scheduled_teacher_id` = guru utama/terjadwal; boleh berbeda dari pelaksana (guru pengganti). Keduanya tersimpan agar histori akurat.
- Nomor pertemuan dihitung otomatis, **tidak** diisi manual, reset per semester.
- Siswa nonaktif/keluar **tidak dihapus**; set `enrollments.end_date` dan/atau `students.status='nonaktif'`.
- **Roster kelas (enrollment) boleh dikelola admin maupun guru pengampu** kelas itu. Guru dibatasi hanya pada kelas yang ditugaskan padanya (RLS `guru_can_write_class`); guru bisa membuat siswa baru & enroll, serta mengeluarkan siswa via `end_date`, tetapi **menghapus** enrollment tetap hak admin (halaman `/admin/students` punya tombol Hapus khusus admin).
- Presensi mengikuti **daftar siswa aktif pada tanggal pertemuan** (dijamin oleh `seed_attendance`).
- Default presensi = `hadir`; nilai lain: `izin`, `sakit`, `alpa`.
- File `.xlsx` hanya rekap keluaran; setiap export dicatat ke `export_logs`.

---

## 9. Alur Utama

### 9.1 Guru mengisi laporan (`/teacher/meetings/new`)
1. Guru login.
2. Pilih semester aktif → pilih sekolah & kelas (dropdown dibatasi kelas yang ditugaskan padanya di term itu, dari `teacher_assignments`).
3. Isi tanggal. Sistem menampilkan **preview** nomor pertemuan (dihitung client-side dari `max(meeting_number)+1` khusus untuk ditampilkan), tapi nilai final selalu diisi trigger DB saat insert — preview tidak pernah dikirim.
4. Guru utama tampil otomatis dari `teacher_assignments`. Guru memilih **guru pelaksana** (default: dirinya).
5. Isi materi (dan catatan opsional).
6. Simpan meeting → presensi ter-seed otomatis → fetch ulang tabel `attendance` → guru ubah siswa yang tidak hadir (default semua `hadir`).
7. Bisa tambah siswa baru / siswa lama yang belum ter-enroll langsung di layar ini (lihat §7 poin 2) — otomatis ikut presensi meeting yang sedang dibuat.
8. Upload 1–2 foto dokumentasi ke bucket privat.
9. Simpan. Data siap direkap.

### 9.2 Admin kelola data
Login → kelola tahun ajaran, sekolah, kelas, akun guru (buat + reset password), siswa (manual atau import Excel) → daftarkan siswa ke kelas per semester (enrollment) → tetapkan penugasan guru utama per semester.

### 9.3 Admin monitoring & rekap
Login → `/monitor`: filter (bulan, sekolah, guru) → lihat laporan, presensi, dokumentasi seluruh guru (read-only, tanpa tombol ubah di halaman ini). → `/reports`: pilih bulan (+opsional sekolah) → lihat pratinjau rekap on-screen → klik **Export Excel** untuk mengunduh `.xlsx`.

---

## 10. Halaman & Rute

| Rute | Role | Isi |
|---|---|---|
| `/login` | publik | form login Supabase Auth |
| `/dashboard` | admin, guru | ringkasan berbeda per role (kartu statistik utk admin; daftar kelas diampu utk guru) |
| `/admin/terms` | admin | CRUD tahun ajaran + set term aktif |
| `/admin/schools` | admin | CRUD sekolah |
| `/admin/classes` | admin | CRUD kelas (per sekolah) |
| `/admin/teachers` | admin | buat akun guru (Auth user + profile), reset password, nonaktifkan |
| `/admin/students` | admin | CRUD siswa, kelola enrollment (masuk/keluar) untuk semua kelas, import Excel massal |
| `/admin/assignments` | admin | penugasan guru utama per kelas/semester |
| `/teacher/meetings` | guru (admin boleh masuk) | daftar pertemuan milik guru login |
| `/teacher/meetings/new` | guru | form laporan (alur §9.1) |
| `/teacher/meetings/[id]` | guru | detail + edit presensi & foto |
| `/teacher/students` | guru | kelola roster (tambah/keluarkan siswa) untuk kelas yang diampu |
| `/monitor` | admin | daftar semua pertemuan lintas guru/sekolah, filter, read-only |
| `/reports` | admin | rekap on-screen + tombol export `.xlsx` |
| `/api/admin/users` | admin (server-checked) | `POST` buat akun guru, `PATCH` reset password |
| `/api/export` | admin (server-checked) | `GET ?month=YYYY-MM[&school_id=...]` → file `.xlsx` |

---

## 11. Akses Data & Pola Query

Gunakan Supabase JS client langsung (RLS aktif otomatis) di client component (`lib/supabase/client.ts`) atau server component (`lib/supabase/server.ts`). Contoh pola penting:

**Membuat pertemuan lalu mengambil presensi hasil seeding:**
```ts
// 1) buat meeting (JANGAN kirim meeting_number)
const { data: meeting } = await supabase
  .from('meetings')
  .insert({
    school_id, class_id, term_id,
    scheduled_teacher_id,      // guru utama
    actual_teacher_id,         // guru pelaksana (default = user)
    meeting_date, material, notes,
    created_by: user.id,
  })
  .select()
  .single();

// 2) ambil presensi yang sudah otomatis dibuat trigger
const { data: attendance } = await supabase
  .from('attendance')
  .select('id, student_id, student_name_snapshot, status')
  .eq('meeting_id', meeting.id)
  .order('student_name_snapshot');

// 3) guru ubah yang tidak hadir → update per baris attendance
```

**Menambah siswa saat pertemuan berlangsung (guru):**
```ts
// 1) buat identitas siswa bila benar-benar baru
const { data: student } = await supabase
  .from('students').insert({ full_name }).select().single();

// 2) enroll ke kelas yang diampu pada term ini (RLS membatasi ke kelas guru)
await supabase.from('enrollments').insert({
  student_id: student.id, class_id, term_id, start_date: meeting_date,
});

// 3) tambahkan ke presensi meeting yang SEDANG berjalan (seed tidak retroaktif)
await supabase.from('attendance').insert({
  meeting_id, student_id: student.id,
  student_name_snapshot: full_name, status: 'hadir',
});
```
Untuk mengeluarkan siswa: `update enrollments set end_date = ..., is_active = false where id = ...` (RLS mengizinkan guru pada kelasnya). Jangan hapus baris enrollment — itu hak admin (dipakai bila salah input, lihat `/admin/students`).

**Preview nomor pertemuan berikutnya (opsional, hanya tampilan):**
Nilai final tetap dari trigger; frontend saat ini menghitung preview dengan `select max(meeting_number)` lalu +1 di client. Jangan andalkan preview sebagai nilai yang dikirim ke `insert`.

**Import siswa massal dari Excel (`/admin/students`):**
File `.xlsx`/`.xls` dibaca di **client** memakai `xlsx` npm package (`XLSX.read` → `sheet_to_json` mode array). Kolom A = nama (wajib), kolom B = NIS (opsional); baris pertama boleh header dan otomatis dilewati. Alur: `insert` batch ke `students` → `insert` batch ke `enrollments` dengan `class_id`/`term_id` yang dipilih di modal import. Template contoh ada di `public/template-import-siswa.xlsx`.

---

## 12. Rekap / Export (`app/api/export/route.ts`)

Export **tidak** memakai Supabase Edge Function — ini adalah **Next.js Route Handler** (`export const runtime = 'nodejs'`) yang dipanggil dari tombol "Export Excel" di `/reports`. Route ini memverifikasi sesi + role admin secara manual (bukan hanya RLS, karena ia memakai `service_role` lewat `lib/supabase/admin.ts` untuk bisa membaca lintas guru dan membuat signed URL foto).

Query dasarnya setara dengan:

**A. Ringkasan mengajar per guru per sekolah:**
```sql
select p.full_name as pengajar,
       s.name      as sekolah,
       count(*)    as jumlah_pertemuan,
       string_agg(m.meeting_date::text, ', ' order by m.meeting_date) as tanggal_mengajar
from meetings m
join profiles p on p.id = m.actual_teacher_id
join schools  s on s.id = m.school_id
-- filter bulan (dan sekolah bila dipilih)
group by p.full_name, s.name;
```

**B. Presensi siswa pivot (kolom P1, P2, P3, …) per kelas per semester** — dibangun di JS dari data `attendance` + `meetings`, dikelompokkan per `sekolah — kelas` lalu dipivot per `meeting_number`.

**Struktur file `.xlsx` yang dihasilkan (4 sheet):**
1. **Rekap Guru** — pengajar, sekolah, jumlah pertemuan, tanggal mengajar.
2. **Presensi Siswa** — pivot per kelas (blok terpisah per kelas, kolom P1/P2/…).
3. **Materi** — tanggal, guru, sekolah, kelas, pertemuan ke-, materi.
4. **Dokumentasi** — tanggal, guru, sekolah, kelas, link foto (**signed URL 7 hari**, bukan URL publik).

Setiap export sukses menulis satu baris ke `export_logs` (period, exported_by, status, notes filter sekolah bila ada).

---

## 13. Konvensi Koding

- TypeScript strict; tipe DB ditulis manual di `lib/types.ts` mengikuti `supabase/schema.sql` (belum pakai `supabase gen types` — lakukan itu bila skema berubah signifikan, lalu selaraskan `lib/types.ts`).
- Jangan pernah taruh `SUPABASE_SERVICE_ROLE_KEY` di kode yang jalan di browser. Hanya dipakai di `lib/supabase/admin.ts`, yang hanya boleh diimpor dari Route Handler (`app/api/**`), tidak dari client component.
- Otorisasi = andalkan RLS untuk operasi data biasa; Route Handler yang memakai `service_role` **wajib** cek sesi + role admin secara manual di awal fungsi (lihat pola `requireAdmin()` di `app/api/admin/users/route.ts`).
- Guard role di level halaman dilakukan di `layout.tsx` per route group (server component, `redirect()` bila role tidak sesuai) — bukan di `proxy.ts`.
- Format tanggal & label UI dalam Bahasa Indonesia (`lib/format.ts`).

---

## 14. Environment Variables

Didefinisikan di `.env.local` (lihat `SETUP.md` untuk cara mendapatkan nilainya):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # HANYA dipakai server-side (Route Handler)
```

---

## 15. Pengembangan Selanjutnya (belum dikerjakan)

Jadwal mengajar & pembanding kehadiran guru (deteksi pertemuan yang seharusnya ada tapi bolong — perlu tabel jadwal baru), integrasi Google Sheets API, dashboard statistik & grafik, export PDF, notifikasi/WhatsApp, kalender akademik, riwayat pergantian guru.
