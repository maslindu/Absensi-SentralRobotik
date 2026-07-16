# PRD — Sistem Presensi & Monitoring Pengajar Komunitas Robotik Soloraya

> Dokumen ini melengkapi `README.md` (arsitektur & teknis) dengan sudut pandang produk: masalah, tujuan terukur, user story, dan kriteria penerimaan. Dipakai untuk menentukan *apa yang harus jalan* dan *kapan sebuah fitur dianggap selesai*.

**Status:** Fungsional — fitur inti pada §4 sudah terimplementasi di repo ini · **Versi:** 1.1 · **Sumber kebenaran teknis:** `supabase/schema.sql`, `README.md`

---

## 1. Latar Belakang & Masalah

Komunitas Robotik Soloraya punya beberapa pengajar yang mengajar ekstrakurikuler robotik di banyak sekolah dan kelas. Sebelum sistem ini ada, pencatatan kegiatan mengajar dilakukan manual, sehingga sulit memonitor kehadiran guru, kehadiran siswa, materi, dan dokumentasi — dan sulit membuat rekap bulanan untuk pengurus komunitas.

**Masalah yang diselesaikan:**
- Tidak ada pusat data kegiatan mengajar → sulit evaluasi & rekap.
- Sulit tahu siapa guru yang benar-benar mengajar saat ada penggantian mendadak.
- Presensi siswa tercecer, apalagi saat ada siswa masuk/keluar di tengah semester.
- Rekap bulanan dikerjakan manual dan rawan salah ketik/salah hitung.

---

## 2. Tujuan & Metrik Keberhasilan

| Tujuan | Metrik keberhasilan |
|---|---|
| Mempermudah pencatatan pertemuan | Guru bisa menyelesaikan 1 laporan pertemuan < 3 menit di HP |
| Data terpusat & akurat | 100% pertemuan tercatat di database; tidak ada rekap manual paralel |
| Monitoring mudah bagi pengurus | Admin bisa melihat rekap bulanan tanpa minta data ke guru |
| Histori tidak hilang | Siswa keluar/pindah tidak menghapus presensi lama |
| Rekap otomatis | Rekap 1 bulan bisa di-export ke `.xlsx` langsung dari halaman `/reports` dalam < 1 menit |

**Non-goals (di luar tujuan):** penilaian akademik, pembayaran, kurikulum, aplikasi Android native, notifikasi otomatis, integrasi Google Sheets, dashboard grafik/statistik.

---

## 3. Persona Pengguna

Sistem punya **2 peran**. Role terpisah "Ketua" yang ada di rancangan awal sudah dihapus (`supabase/migrations/remove_ketua.sql`) karena seluruh kebutuhannya (monitoring read-only + rekap) sudah tercakup penuh oleh role Admin.

**Admin (pengurus komunitas).** Menyiapkan & merapikan semua data master (sekolah, kelas, tahun ajaran), mengelola akun guru (buat & reset password), menambah/mengeluarkan siswa, menetapkan penugasan guru. Juga memantau seluruh laporan dari semua guru/sekolah lewat `/monitor` dan mengunduh rekap bulanan lewat `/reports`. Butuh kontrol penuh atas seluruh data.

**Guru/Pengajar.** Mengisi laporan di lapangan, sering lewat HP, ingin cepat & sederhana. Kadang menggantikan guru lain. Sering jadi pihak pertama yang tahu daftar siswa, jadi bisa menambah/mengeluarkan siswa di kelasnya sendiri tanpa menunggu admin.

---

## 4. Cakupan Fitur

### Sudah berjalan
Login & role (admin/guru) · manajemen tahun ajaran/semester · CRUD sekolah, kelas, guru (buat akun + reset password), siswa · import siswa massal dari Excel · enrollment siswa (masuk/keluar tengah semester) · penugasan guru utama · laporan pertemuan (nomor otomatis, reset per semester) · guru utama vs guru pelaksana · presensi siswa (auto-seed, default hadir) · tambah/keluarkan siswa langsung dari layar presensi · upload dokumentasi (maks 2 foto, bucket privat) · monitoring seluruh pertemuan oleh admin (`/monitor`) · rekap on-screen + export `.xlsx` (`/reports`).

### Belum dikerjakan (di luar cakupan saat ini)
Jadwal mengajar & deteksi pertemuan bolong · integrasi Google Sheets API · dashboard statistik/grafik · export PDF · notifikasi/WhatsApp · kalender akademik · riwayat pergantian guru sebagai entitas terpisah.

---

## 5. User Stories & Kriteria Penerimaan

Prioritas: **P0** = wajib, **P1** = sangat diinginkan, **P2** = opsional. Status mengikuti implementasi saat ini di repo.

### 5.1 Autentikasi & Akses

**US-01 (P0, selesai)** — Sebagai pengguna, saya ingin login dengan email & password agar bisa mengakses sistem sesuai peran saya.
- Login berhasil mengarahkan ke `/dashboard`, yang menampilkan konten berbeda sesuai role (admin/guru).
- Login gagal menampilkan pesan error yang jelas.
- Pengguna tanpa sesi tidak bisa membuka halaman internal — `proxy.ts` mengalihkan ke `/login`.
- Pengguna dengan profil belum dibuat/dinonaktifkan mendapat pesan "Akun belum aktif" (bukan redirect loop) — lihat `app/(app)/layout.tsx`.

**US-02 (P0, selesai)** — Sebagai sistem, saya ingin membatasi akses per peran agar data hanya bisa diubah oleh yang berhak.
- Guru tidak bisa membuka `/admin/*`, `/monitor`, `/reports` — layout masing-masing me-redirect ke `/dashboard` bila role bukan admin.
- Guru hanya bisa membuat/mengubah laporan **dan mengelola roster siswa** untuk kelas yang ditugaskan padanya.
- Pembatasan ditegakkan di database (RLS `guru_can_write_class`), bukan hanya UI/layout — terbukti dari policy di `supabase/schema.sql` §RLS, guru ditolak saat mencoba menulis di kelas yang bukan miliknya.

### 5.2 Manajemen Master (Admin)

**US-03 (P0, selesai)** — Sebagai admin, saya ingin CRUD sekolah, kelas, guru, dan siswa agar data master siap dipakai.
- Bisa menambah, mengubah, menonaktifkan (bukan hapus permanen), dan melihat daftar (`/admin/schools`, `/admin/classes`, `/admin/teachers`, `/admin/students`).
- Data yang dinonaktifkan tidak muncul di pilihan aktif, tapi tetap tersimpan.
- Akun guru dibuat lewat `POST /api/admin/users` (buat user Supabase Auth + baris `profiles`, role selalu `guru`); password bisa direset lewat `PATCH /api/admin/users`. Password tidak pernah disimpan di tabel aplikasi.

**US-03b (P1, selesai)** — Sebagai admin, saya ingin mengimpor banyak siswa sekaligus dari file Excel agar tidak perlu input satu-satu di awal semester.
- Modal "Import Excel" di `/admin/students` menerima `.xlsx`/`.xls`, kolom A = nama (wajib), kolom B = NIS (opsional).
- Semua siswa pada file dibuat lalu langsung di-enroll ke kelas & semester yang dipilih.
- Hasil import menampilkan jumlah ditambahkan, dilewati, dan pesan error per baris bila ada.

**US-04 (P0, selesai)** — Sebagai admin, saya ingin mengelola tahun ajaran & semester agar penomoran pertemuan dan enrollment mengikuti periode yang benar.
- Bisa membuat term (mis. 2025/2026 Ganjil) dan menandai satu term sebagai aktif (`/admin/terms`).
- Nomor pertemuan tereset saat pindah semester (scope trigger = `class_id` + `term_id`).

**US-05 (P0, selesai)** — Sebagai admin **atau guru pengampu**, saya ingin mendaftarkan siswa ke kelas per semester (enrollment) agar presensi selalu mengikuti anggota kelas yang benar.
- Bisa menambah siswa ke kelas dengan tanggal mulai.
- Bisa menandai siswa keluar dengan mengisi tanggal selesai — presensi lama tetap ada.
- **Guru hanya boleh mengelola roster kelas yang ditugaskan padanya** (ditegakkan RLS); tidak bisa menyentuh kelas guru lain.
- Menghapus enrollment tetap hak admin (tombol Hapus hanya ada di `/admin/students`, untuk menjaga histori); guru "mengeluarkan" siswa dengan mengisi tanggal selesai, bukan menghapus.

**US-05b (P0, selesai)** — Sebagai guru, saya ingin menambah/mengeluarkan siswa **saat pembelajaran berlangsung** tanpa menunggu admin, agar tidak terhambat bila daftar siswa baru diketahui di pertemuan pertama atau ada perubahan di tengah semester.
- Guru bisa membuat identitas siswa baru dan langsung meng-enroll ke kelas yang ia ampu — lewat `/teacher/students` atau langsung dari form `/teacher/meetings/new`.
- Saat guru menambah siswa **di layar laporan pertemuan yang sedang berjalan**, siswa itu langsung muncul di presensi pertemuan tersebut (default hadir) — implementasi insert manual ke `attendance`, bukan mengandalkan trigger seeding (yang hanya jalan saat `meetings` dibuat).
- Guru bisa menandai siswa keluar (isi `end_date`) sehingga tidak muncul di pertemuan berikutnya, tetapi presensi sebelumnya tetap utuh.
- Semua perubahan roster oleh guru terbatas pada kelasnya sendiri (RLS `guru_can_write_class`).

**US-06 (P0, selesai)** — Sebagai admin, saya ingin menetapkan guru utama untuk tiap kelas per semester agar jadwal jelas.
- Penugasan tersimpan per (guru, kelas, term) di `/admin/assignments`, unik per kombinasi.
- Guru utama muncul otomatis saat laporan dibuat, dan menentukan kelas mana yang muncul di dropdown guru saat membuat laporan.

### 5.3 Laporan Mengajar (Guru)

**US-07 (P0, selesai)** — Sebagai guru, saya ingin melihat hanya kelas yang saya ampu agar tidak salah pilih.
- Daftar kelas di `/teacher/meetings/new` dibatasi sesuai `teacher_assignments` guru pada term aktif.

**US-08 (P0, selesai)** — Sebagai guru, saya ingin membuat laporan pertemuan dengan nomor otomatis agar tidak perlu menghitung manual.
- `meeting_number` diisi otomatis oleh trigger DB (`set_meeting_number`); guru tidak mengetiknya — hanya melihat preview.
- Nomor benar sesuai urutan kelas+semester walau dua guru mengisi berdekatan (dikunci pakai advisory lock).

**US-09 (P0, selesai)** — Sebagai guru, saya ingin memilih guru pelaksana bila bukan saya yang mengajar agar histori penggantian tercatat.
- Default guru pelaksana (`actual_teacher_id`) = guru yang login.
- Guru utama (`scheduled_teacher_id`) & pelaksana tersimpan terpisah dan keduanya terlihat di detail laporan.

**US-10 (P0, selesai)** — Sebagai guru, saya ingin presensi otomatis terisi "hadir" untuk semua siswa aktif agar saya cukup mengubah yang tidak hadir.
- Saat pertemuan dibuat, semua siswa aktif kelas itu muncul berstatus hadir (trigger `seed_attendance`).
- Status bisa diubah ke izin/sakit/alpa; opsional beri keterangan (`remarks`).
- Siswa yang masuk (enrollment) setelah tanggal pertemuan tidak muncul pada pertemuan sebelumnya.

**US-11 (P0, selesai)** — Sebagai guru, saya ingin mengisi materi dan mengunggah 1–2 foto dokumentasi agar kegiatan terbukti.
- Materi berupa teks singkat (`material`).
- Bisa unggah 1 atau 2 foto; foto ke-3 ditolak baik di UI maupun oleh trigger `enforce_photo_limit`.
- Foto tersimpan di bucket privat `meeting-documentation`, ditampilkan lewat signed URL — tidak pernah lewat URL publik.

**US-12 (P1, selesai)** — Sebagai guru, saya ingin melihat & mengubah laporan yang sudah saya buat agar bisa memperbaiki kesalahan.
- Guru bisa membuka `/teacher/meetings/[id]` dan mengedit materi/presensi/foto untuk laporannya sendiri.

### 5.4 Monitoring & Rekap (Admin)

**US-13 (P0, selesai)** — Sebagai admin, saya ingin melihat seluruh laporan dan memfilter agar bisa memonitor kegiatan semua guru.
- `/monitor` bisa filter berdasarkan bulan, sekolah, guru.
- Halaman ini read-only — tidak ada aksi ubah/hapus di sini (ubah data tetap lewat halaman guru pemilik laporan atau langsung di database oleh admin bila darurat).

**US-14 (P0, selesai)** — Sebagai admin, saya ingin melihat ringkasan mengajar per guru (jumlah pertemuan, tanggal, sekolah) agar bisa mengevaluasi keaktifan.
- `/reports` menampilkan pratinjau: pengajar, sekolah, jumlah pertemuan, daftar tanggal — dihitung dari data `meetings` bulan terpilih.

**US-15 (P0, selesai)** — Sebagai admin, saya ingin export rekap bulanan ke `.xlsx` agar mudah diarsipkan/dibagikan.
- Tombol **Export Excel** di `/reports` memanggil `GET /api/export?month=YYYY-MM[&school_id=...]`.
- Satu file berisi 4 sheet: Rekap Guru, Presensi Siswa (pivot P1/P2/…), Materi, Dokumentasi (link foto signed URL 7 hari).
- Data di file sesuai isi database saat request dibuat; setiap export tercatat di `export_logs`.
- Bila tidak ada data pada periode terpilih, endpoint mengembalikan pesan "Belum ada data untuk periode ini" (bukan file kosong).

---

## 6. Aturan Bisnis (ringkas)

- Satu pertemuan tepat satu guru pelaksana.
- Nomor pertemuan otomatis & reset per semester; tidak diisi manual.
- Data master tidak dihapus permanen (pakai nonaktif / `end_date`).
- Roster kelas (enrollment) boleh dikelola admin **dan** guru pengampu kelas itu; guru dibatasi hanya pada kelasnya sendiri.
- Presensi mengikuti siswa aktif pada tanggal pertemuan.
- Default presensi = hadir.
- File `.xlsx` hanya output; database adalah sumber kebenaran.

(Detail teknis & pemaksaan lewat trigger/RLS ada di `README.md` §7–8 dan `supabase/schema.sql`.)

---

## 7. Kebutuhan Non-Fungsional

- **Responsif:** nyaman di HP & laptop; form guru (`/teacher/meetings/new`) dioptimalkan untuk HP (sidebar berubah jadi bottom-nav).
- **Keamanan:** akses dibatasi per role via RLS + guard layout server-side; foto anak disimpan di bucket privat, `service_role` key hanya dipakai di Route Handler.
- **Reliabilitas:** histori pertemuan & presensi tidak hilang (data master dinonaktifkan, bukan dihapus).
- **Skalabilitas:** siap saat sekolah/kelas/guru bertambah — tidak ada batas keras di skema selain unik-per-kombinasi yang memang disengaja.
- **Kemudahan:** alur pengisian sederhana & minim langkah.
- **Bahasa:** antarmuka Bahasa Indonesia.

---

## 8. Asumsi & Batasan

- Jumlah pengguna kecil (komunitas), trafik rendah — tier gratis Supabase cukup.
- Guru dianggap saling percaya; guru boleh melihat data kelas yang diampu, tidak perlu isolasi ketat antar guru.
- Satu siswa berada di satu kelas per semester (untuk konteks ini — skema teknis memungkinkan lebih dari satu lewat enrollment terpisah, tapi alur UI tidak dirancang untuk itu).
- Export cukup `.xlsx` yang diunduh langsung dari browser; tidak ada rencana Google Sheets API dalam waktu dekat.

---

## 9. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| AI/dev mengirim `meeting_number` manual saat insert | Ditegaskan di `README.md` §7 & §11: nomor selalu dari trigger, frontend hanya preview |
| Presensi tidak muncul setelah meeting dibuat | Pastikan enrollment aktif (`start_date <= meeting_date`, `end_date` kosong/≥ tanggal) sebelum buat pertemuan |
| Foto anak bocor | Bucket privat + signed URL berumur pendek (7 hari untuk export, sesuai kebutuhan tampil di `[id]`) |
| Salah asumsi memakai Supabase Edge Function saat menambah fitur baru | Tidak ada Edge Function di proyek ini — semua operasi `service_role` lewat Next.js Route Handler (`app/api/**`), lihat `README.md` §4 & §12 |
| Sistem tidak bisa deteksi pertemuan bolong | Diterima sebagai batasan saat ini; perlu tabel jadwal terpisah bila dibutuhkan ke depan |
