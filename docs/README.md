# Sistem Presensi & Monitoring Pengajar — Komunitas Robotik Soloraya

> **Untuk AI coding agent / developer:** Dokumen ini adalah *single source of truth* untuk membangun sistem. Baca sampai selesai sebelum menulis kode. Skema database final ada di `schema.sql` (sudah divalidasi & diuji di PostgreSQL). Cara setup & menjalankan ada di `SETUP.md`.

---

## 1. Ringkasan Proyek

Aplikasi web (responsive, dipakai di HP & laptop) untuk mencatat kegiatan mengajar ekstrakurikuler robotik di banyak sekolah. Sistem merekam: kehadiran & materi tiap pertemuan, guru yang benar-benar mengajar, presensi siswa, dan foto dokumentasi. Ketua komunitas memakainya untuk monitoring, dan tiap bulan data direkap ke Excel/Google Sheets.

**Prinsip inti:**
- Database aplikasi = sumber kebenaran. Excel/Google Sheets hanya **output laporan**, bukan sumber data.
- Nomor pertemuan **reset tiap semester**, dihitung **otomatis** server-side.
- Siswa bisa masuk/keluar di tengah semester tanpa merusak histori presensi.
- Data master **tidak dihapus permanen** — cukup dinonaktifkan.
- Keamanan ditegakkan oleh **Row Level Security (RLS)** di database, bukan hanya di frontend.

---

## 2. Lingkup

### Termasuk (MVP)
Login & role, CRUD sekolah/kelas/guru/siswa, penugasan guru, tahun ajaran & semester, laporan pertemuan (nomor otomatis), guru utama vs guru pelaksana, presensi siswa, upload dokumentasi (maks 2 foto), monitoring ketua, dan export rekap bulanan (.xlsx).

### Tidak termasuk (MVP)
Penilaian akademik, pembayaran, manajemen kurikulum, aplikasi Android native (cukup responsive web), jadwal/kalender akademik penuh, notifikasi WhatsApp, dashboard statistik/grafik. Semua ini masuk *future development*.

---

## 3. Peran Pengguna & Hak Akses

| Peran | Ringkasan | Hak |
|---|---|---|
| **Admin** | Kelola semua data master | CRUD sekolah, kelas, guru, siswa, penugasan, tahun ajaran; lihat & hapus semua laporan; export |
| **Guru** | Mengisi laporan mengajar & kelola roster kelasnya | Login; lihat kelas yang dia ampu; buat/ubah laporan pertemuan; isi presensi; upload foto; **menambah/menonaktifkan siswa (enrollment) untuk kelas yang ditugaskan padanya** — termasuk saat pertemuan berlangsung; lihat riwayat mengajarnya |
| **Ketua** | Monitoring | Login; **hanya baca** seluruh laporan, presensi, dokumentasi; lihat & jalankan rekap. Tidak bisa mengubah data apa pun |

Aturan akses ini **sudah diterjemahkan menjadi RLS di `schema.sql`** — jangan menegakkan otorisasi hanya di frontend.

---

## 4. Arsitektur

```
┌──────────────┐     ┌────────────────────────────────────────┐
│   Next.js    │     │              Supabase                  │
│ (App Router) │────▶│  Auth  ·  PostgreSQL (RLS)  ·  Storage │
│  TypeScript  │     │                                        │
│  Tailwind    │     │  Edge Function: export-monthly (.xlsx) │
└──────────────┘     └────────────────────────────────────────┘
        │                                   │
        └─── Supabase JS client (RLS aktif) ┘
```

**Keputusan arsitektur (penting):**
- **Tidak pakai Laravel / backend terpisah.** Untuk skala komunitas ini, backend terpisah cuma menambah beban hosting & pemeliharaan. Frontend berbicara langsung ke Supabase memakai client library; keamanan dijaga RLS.
- **Auth = Supabase Auth** (email/password). Tabel `profiles` menautkan `auth.users` ke `roles`. **Tidak ada** kolom password di tabel aplikasi.
- **Logika sensitif** (nomor pertemuan, auto-seed presensi, batas foto, proteksi role) berada di **trigger/fungsi PostgreSQL**, bukan di frontend — supaya tidak bisa dilewati.
- **Export bulanan** dijalankan oleh **Edge Function** (memakai `service_role`) yang membangun file `.xlsx`. Integrasi Google Sheets API menyusul setelah MVP.

---

## 5. Tech Stack

| Lapisan | Pilihan | Catatan |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Responsive, mobile-friendly |
| Styling | **Tailwind CSS** | + komponen shadcn/ui (opsional, direkomendasikan) |
| Auth | **Supabase Auth** | email/password |
| Database | **Supabase PostgreSQL** | skema di `schema.sql` |
| Client DB | **@supabase/supabase-js** + **@supabase/ssr** | untuk auth di App Router (server & client) |
| Storage | **Supabase Storage** | bucket privat `meeting-documentation` |
| Export | **Supabase Edge Function** (Deno) | membuat `.xlsx` (mis. lib `xlsx`/`exceljs`) |
| Deploy | **Vercel** (frontend) + Supabase (backend) | |

---

## 6. Struktur Folder yang Disarankan

```
robotik-presensi/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                # cek sesi + role, sidebar
│   │   ├── admin/
│   │   │   ├── schools/              # CRUD sekolah
│   │   │   ├── classes/              # CRUD kelas
│   │   │   ├── teachers/             # CRUD guru (profiles role=guru)
│   │   │   ├── students/             # CRUD siswa + enrollment
│   │   │   ├── assignments/          # penugasan guru utama
│   │   │   └── terms/                # tahun ajaran & semester
│   │   ├── teacher/
│   │   │   └── meetings/
│   │   │       ├── page.tsx          # daftar pertemuan guru
│   │   │       ├── new/page.tsx      # form laporan baru
│   │   │       └── [id]/page.tsx     # detail + edit presensi & foto
│   │   ├── monitor/                  # dashboard ketua (read-only)
│   │   └── reports/                  # rekap & tombol export
│   └── layout.tsx
├── components/                       # komponen UI reusable
├── lib/
│   ├── supabase/client.ts            # browser client
│   ├── supabase/server.ts            # server client (cookies)
│   └── types.ts                      # tipe hasil generate dari Supabase
├── middleware.ts                     # refresh sesi + guard rute per role
├── supabase/
│   ├── schema.sql                    # (dari file yang sudah dibuat)
│   ├── storage_policies.sql          # bucket + policy storage
│   └── functions/export-monthly/     # Edge Function
├── .env.local
└── package.json
```

---

## 7. Model Data (ringkasan; detail penuh di `schema.sql`)

Relasi inti:

```
roles ──< profiles (=auth.users)
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
| `roles` | admin / guru / ketua |
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
| `export_logs` | audit rekap bulanan (opsional) |

### Perilaku otomatis yang WAJIB dipahami sebelum koding

1. **Nomor pertemuan otomatis.** Jangan pernah kirim `meeting_number` dari frontend. Trigger `set_meeting_number` mengisinya = max+1 dalam scope `(class_id, term_id)`, aman dari race condition. Reset ke 1 tiap ganti semester.
2. **Presensi auto-seed.** Begitu `meetings` di-INSERT, trigger `seed_attendance` otomatis membuat baris `attendance` berstatus `hadir` untuk **semua siswa yang aktif ter-enroll** di kelas+semester itu pada `meeting_date`. Alur frontend: buat meeting → **fetch ulang** baris `attendance` → guru tinggal mengubah yang tidak `hadir`.
   - **Tambah siswa saat pertemuan berlangsung:** seeding hanya jalan saat meeting dibuat. Jika guru menambah siswa ke kelas *setelah* meeting ada (mis. siswa baru muncul di pertemuan pertama), aplikasi harus: (a) buat `students` bila baru, (b) buat `enrollments` di kelas itu, lalu (c) **insert satu baris `attendance` untuk meeting yang sedang berjalan** (status `hadir`, isi `student_name_snapshot`). Enrollment saja tidak menambah presensi ke meeting yang sudah ada.
3. **Snapshot nama.** `attendance.student_name_snapshot` diisi saat seeding. Rekap lama tetap benar walau nama/kelas siswa berubah kemudian.
4. **Batas 2 foto.** Trigger `enforce_photo_limit` menolak foto ke-3 per pertemuan.
5. **Proteksi role.** Trigger `protect_profile_privileges` mencegah non-admin mengubah `role_id`/`is_active` miliknya.

---

## 8. Aturan Bisnis

- Satu pertemuan tepat **satu** `actual_teacher_id` (guru pelaksana).
- `scheduled_teacher_id` = guru utama/terjadwal; boleh berbeda dari pelaksana (guru pengganti). Keduanya tersimpan agar histori akurat.
- Nomor pertemuan dihitung otomatis, **tidak** diisi manual, reset per semester.
- Siswa nonaktif/keluar **tidak dihapus**; set `enrollments.end_date` dan/atau `students.status='nonaktif'`.
- **Roster kelas (enrollment) boleh dikelola admin maupun guru pengampu** kelas itu. Guru dibatasi hanya pada kelas yang ditugaskan padanya (RLS `guru_can_write_class`); guru bisa membuat siswa baru & enroll, serta mengeluarkan siswa via `end_date`, tetapi **menghapus** enrollment tetap hak admin.
- Presensi mengikuti **daftar siswa aktif pada tanggal pertemuan** (dijamin oleh `seed_attendance`).
- Default presensi = `hadir`; nilai lain: `izin`, `sakit`, `alpa`.
- Google Sheets/Excel hanya rekap keluaran.

---

## 9. Alur Utama

### 9.1 Guru mengisi laporan
1. Guru login.
2. Pilih semester aktif → pilih sekolah & kelas (dibatasi kelas yang ditugaskan padanya).
3. Isi tanggal. Sistem otomatis menentukan nomor pertemuan (jangan ditampilkan sebagai input; boleh ditampilkan sebagai preview via `report`/max+1, tapi nilai final dari server).
4. Guru utama tampil otomatis dari `teacher_assignments`. Guru memilih **guru pelaksana** (default: dirinya).
5. Isi materi.
6. Simpan meeting → presensi ter-seed otomatis → guru ubah siswa yang tidak hadir.
7. Upload 1–2 foto dokumentasi.
8. Simpan. Data siap direkap.

### 9.2 Admin kelola data
Login → kelola tahun ajaran, sekolah, kelas, guru, siswa → daftarkan siswa ke kelas per semester (enrollment) → tetapkan penugasan guru utama per semester.

### 9.3 Ketua monitoring
Login → filter (bulan/semester/sekolah/guru/kelas) → lihat laporan, presensi, dokumentasi, dan rekap. Tanpa hak ubah.

---

## 10. Halaman & Rute (checklist build)

| Rute | Role | Isi |
|---|---|---|
| `/login` | publik | form login Supabase Auth |
| `/admin/terms` | admin | CRUD tahun ajaran + set term aktif |
| `/admin/schools` | admin | CRUD sekolah |
| `/admin/classes` | admin | CRUD kelas (per sekolah) |
| `/admin/teachers` | admin | kelola akun guru (buat user + profile role=guru) |
| `/admin/students` | admin | CRUD siswa + kelola enrollment (masuk/keluar) untuk semua kelas |
| `/teacher/students` | guru | kelola roster (tambah/keluarkan siswa) **hanya untuk kelas yang diampu**; juga bisa dilakukan langsung dari layar presensi |
| `/admin/assignments` | admin | penugasan guru utama per kelas/semester |
| `/teacher/meetings` | guru | daftar pertemuan miliknya |
| `/teacher/meetings/new` | guru | form laporan (alur 9.1) |
| `/teacher/meetings/[id]` | guru | detail + edit presensi & foto |
| `/monitor` | ketua (+admin) | ringkasan & daftar semua pertemuan, filter |
| `/reports` | admin, ketua | rekap + tombol export .xlsx |

---

## 11. Akses Data & Pola Query

Gunakan Supabase JS client langsung (RLS aktif otomatis). Contoh pola penting:

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
Untuk mengeluarkan siswa: `update enrollments set end_date = ... where id = ...` (RLS mengizinkan guru pada kelasnya). Jangan hapus baris enrollment.

**Preview nomor pertemuan berikutnya (opsional, hanya tampilan):**
Nilai final tetap dari trigger; untuk preview boleh `select max(meeting_number)+1` via RPC. Jangan andalkan preview sebagai nilai simpan.

---

## 12. Rekap / Export (query sudah diuji)

Dua query berikut sudah diverifikasi di PostgreSQL dan jadi dasar export. Bungkus sebagai fungsi RPC PostgreSQL atau jalankan di Edge Function `export-monthly`.

**A. Ringkasan mengajar per guru per sekolah (monitoring guru):**
```sql
select p.full_name as pengajar,
       s.name      as sekolah,
       count(*)    as jumlah_pertemuan,
       string_agg(m.meeting_date::text, ', ' order by m.meeting_date) as tanggal_mengajar
from meetings m
join profiles p on p.id = m.actual_teacher_id
join schools  s on s.id = m.school_id
-- filter bulan/semester sesuai kebutuhan export
group by p.full_name, s.name;
```

**B. Presensi siswa pivot (kolom P1, P2, P3, …) per kelas per semester:**
```sql
select a.student_name_snapshot as nama,
       max(case when m.meeting_number = 1 then a.status::text end) as P1,
       max(case when m.meeting_number = 2 then a.status::text end) as P2,
       max(case when m.meeting_number = 3 then a.status::text end) as P3
       -- tambah kolom sesuai jumlah pertemuan
from attendance a
join meetings m on m.id = a.meeting_id
where m.class_id = :class_id and m.term_id = :term_id
group by a.student_name_snapshot
order by nama;
```

**Struktur file .xlsx bulanan (saran):** satu sheet per bulan berisi blok: (1) Rekap mengajar guru [pengajar, sekolah, jumlah pertemuan, tanggal], (2) Presensi siswa pivot per kelas, (3) Materi [tanggal, guru, sekolah, materi], (4) Dokumentasi [tanggal, guru, link foto (signed URL)].

---

## 13. Rencana Build Bertahap

Kerjakan berurutan; tiap fase menghasilkan sesuatu yang bisa dites.

1. **Fondasi:** setup Next.js + Supabase client, jalankan `schema.sql` & `storage_policies.sql`, buat 1 admin manual.
2. **Auth & guard:** login, middleware, layout per role, redirect sesuai role.
3. **Master data admin:** terms → schools → classes → teachers → students → enrollments → assignments.
4. **Laporan guru:** form pertemuan (alur 9.1), presensi (auto-seed + edit), upload foto.
5. **Monitoring ketua:** daftar & filter, halaman detail read-only.
6. **Rekap & export:** halaman reports + Edge Function `export-monthly` (.xlsx).
7. **Polish:** validasi form, empty state, loading, mobile layout, error handling.

---

## 14. Konvensi Koding

- TypeScript strict; generate tipe DB dari Supabase (`supabase gen types`) ke `lib/types.ts`.
- Jangan pernah taruh `service_role` key di frontend. Hanya di server (Edge Function / route handler).
- Otorisasi = andalkan RLS; frontend hanya menyembunyikan UI, bukan pengaman utama.
- Semua tulisan data lewat operasi Supabase yang menghormati RLS. Operasi lintas-pengguna (export) lewat server.
- Format tanggal & label UI dalam Bahasa Indonesia.

---

## 15. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # HANYA server-side / Edge Function
```

---

## 16. Pengembangan Selanjutnya (post-MVP)

Jadwal mengajar & pembanding kehadiran guru, integrasi Google Sheets API, dashboard statistik & grafik, export PDF, notifikasi/WhatsApp, kalender akademik, riwayat pergantian guru.

> Catatan monitoring guru: MVP hanya mencatat pertemuan yang **terjadi**. Untuk mendeteksi pertemuan yang **seharusnya ada tapi bolong**, perlu tabel jadwal di fase berikutnya.
