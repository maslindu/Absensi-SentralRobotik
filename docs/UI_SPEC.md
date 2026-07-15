# UI / Screen Spec — Sistem Presensi & Monitoring Robotik Soloraya

> Rincian tiap layar: tujuan, siapa yang akses, field/komponen, aksi, state (kosong/loading/error), validasi, dan catatan perilaku yang terkait database. Nama field mengikuti `schema.sql`. Pakai bersama `README.md` (rute & pola query) dan `PRD.md` (kriteria penerimaan).

---

## 0. Prinsip Desain

- **Mobile-first.** Form guru dipakai di lapangan lewat HP; utamakan input besar, sedikit scroll, tombol jelas.
- **Bahasa Indonesia** untuk semua label, tombol, pesan.
- **Sederhana & cepat.** Alur guru harus bisa selesai < 3 menit.
- **Konsisten:** setiap layar daftar punya pola sama (judul + tombol tambah + pencarian/filter + tabel/kartu + empty state).
- **State wajib ada di setiap layar:** *loading*, *empty*, *error*, dan *sukses* (toast).
- **Otorisasi:** sembunyikan aksi yang tidak boleh (mis. tombol Tambah untuk ketua), tapi ingat pengaman sebenarnya ada di RLS.

---

## 1. Layout Global (App Shell)

**Akses:** semua role setelah login.

**Komponen:**
- Header: nama aplikasi, indikator **term aktif** (mis. "2025/2026 Ganjil"), nama user + tombol logout.
- Navigasi (sidebar di desktop, bottom-nav/drawer di HP) yang **berbeda per role**:
  - **Admin:** Dashboard · Tahun Ajaran · Sekolah · Kelas · Guru · Siswa · Penugasan · Pertemuan · Rekap.
  - **Guru:** Dashboard · Pertemuan Saya · Siswa (roster kelas yang diampu) · (buat laporan).
  - **Ketua:** Dashboard/Monitoring · Rekap.

**Catatan:** middleware memuat `profiles.role` sekali; navigasi dirender sesuai role. Term aktif diambil dari `academic_terms where is_active = true`.

---

## 2. Login — `/login`

**Akses:** publik.

**Field:** Email · Password.
**Aksi:** tombol **Masuk**.
**Validasi:** email format valid; password wajib diisi.
**State:**
- *Loading:* tombol disabled + spinner saat proses.
- *Error:* pesan "Email atau password salah" (jangan bocorkan mana yang salah).
**Perilaku:** sukses → redirect ke dashboard sesuai role. Tanpa sesi, akses halaman internal dialihkan ke sini.

---

## 3. Dashboard

Ringkasan ringan sesuai role. Boleh dibuat sederhana di MVP.

- **Admin:** kartu jumlah sekolah, kelas, guru, siswa aktif, pertemuan bulan ini.
- **Guru:** daftar kelas yang diampu (term aktif) + tombol cepat "Buat Laporan".
- **Ketua:** kartu total sekolah/guru/kelas/pertemuan + pintasan ke Rekap.

---

## 4. Tahun Ajaran — `/admin/terms`  *(Admin)*

**Tujuan:** kelola periode & tentukan term aktif.

**Daftar:** kolom Tahun Ajaran (`year_label`), Semester (`semester`: ganjil/genap), Tanggal Mulai/Selesai, Status Aktif.
**Aksi:** Tambah · Edit · **Set Aktif** (menandai satu term aktif).
**Form (tambah/edit):** `year_label` (teks, mis. 2025/2026) · `semester` (pilihan: Ganjil/Genap) · `start_date` · `end_date` · `is_active` (toggle).
**Validasi:** kombinasi (year_label, semester) unik; tanggal selesai ≥ mulai.
**Catatan:** hanya satu term ideal-nya aktif; jika lebih dari satu, pakai yang dipilih user di header.

---

## 5. Sekolah — `/admin/schools`  *(Admin; Guru/Ketua bisa lihat)*

**Daftar:** Nama, Kota/Alamat (opsional), Status. Ada **pencarian** by nama.
**Aksi:** Tambah · Edit · **Nonaktifkan** (bukan hapus).
**Form:** `name` (wajib, unik) · `address` (opsional) · `contact_person` (opsional) · `is_active`.
**Validasi:** nama wajib & unik.
**Empty state:** "Belum ada sekolah. Tambahkan sekolah pertama."

---

## 6. Kelas — `/admin/classes`  *(Admin)*

**Tujuan:** kelola kelas per sekolah (nama bebas per sekolah, mis. 7, 7A).

**Daftar:** Sekolah, Nama Kelas, Grade (opsional), Status. **Filter** by sekolah.
**Aksi:** Tambah · Edit · Nonaktifkan.
**Form:** `school_id` (dropdown sekolah) · `name` (wajib) · `grade_level` (opsional) · `is_active`.
**Validasi:** (school_id, name) unik.

---

## 7. Guru — `/admin/teachers`  *(Admin)*

**Tujuan:** kelola akun pengajar.

**Daftar:** Nama, Email, No. HP, Status.
**Aksi:** Tambah · Edit · Nonaktifkan.
**Form tambah:** `full_name` · email · password awal · `phone` (opsional).
**Perilaku (penting):** membuat guru = **buat user di Supabase Auth** (lewat server/route handler dengan service key) **lalu** insert `profiles` dengan `role_id` = guru. Jangan simpan password di tabel aplikasi.
**Validasi:** email valid & unik; nama wajib.
**Catatan:** halaman serupa bisa dipakai untuk membuat akun **ketua** (role_id = ketua), atau sediakan pilihan role saat menambah user.

---

## 8. Siswa & Enrollment — `/admin/students` (Admin) · `/teacher/students` (Guru)

**Tujuan:** kelola identitas siswa **dan** keanggotaan kelas per semester (inti dari kebutuhan "masuk/keluar tengah semester").

**Akses & cakupan:**
- **Admin:** semua siswa lintas sekolah/kelas.
- **Guru:** hanya roster **kelas yang ditugaskan padanya** (RLS membatasi). Guru bisa membuat siswa baru & meng-enroll/mengeluarkan siswa di kelasnya sendiri — tidak perlu menunggu admin. Guru **tidak** bisa menghapus enrollment (hanya isi tanggal keluar) dan tidak menyentuh kelas guru lain.

**Daftar siswa:** Nama, NIS (opsional), Status. **Filter** by sekolah/kelas (via enrollment) & pencarian nama. Untuk guru, daftar difilter otomatis ke kelasnya.
**Aksi:** Tambah siswa · Edit · **Kelola Enrollment** · (admin: Nonaktifkan global).

**Form siswa:** `full_name` (wajib) · `nis` (opsional) · `gender` (opsional) · `status` (aktif/nonaktif — kolom global ini hanya admin).

**Panel Enrollment (per siswa):**
- Tampilkan enrollment aktif & histori: Kelas, Term, Tanggal Mulai, Tanggal Selesai, Status.
- **Tambah enrollment:** pilih `class_id` + `term_id` + `start_date`. Artinya "siswa masuk kelas ini di semester ini". (Guru: `class_id` dibatasi ke kelas yang ia ampu.)
- **Keluarkan siswa:** isi `end_date` pada enrollment (jangan hapus). Presensi lama tetap utuh.
**Validasi:** (student_id, class_id, term_id) unik; end_date ≥ start_date.
**Catatan perilaku:** presensi pertemuan mengacu enrollment yang aktif pada tanggal pertemuan — jadi enrollment harus benar sebelum/saat pertemuan dibuat. Untuk penambahan saat pertemuan berjalan, lihat §11-D.

---

## 9. Penugasan Guru — `/admin/assignments`  *(Admin)*

**Tujuan:** menetapkan **guru utama** per kelas per semester.

**Daftar:** Guru, Sekolah, Kelas, Term, Status. **Filter** by guru/sekolah/term.
**Aksi:** Tambah · Nonaktifkan.
**Form:** `teacher_id` (dropdown guru) · `school_id` · `class_id` (dependent pada sekolah) · `term_id` · `is_active`.
**Validasi:** (teacher_id, class_id, term_id) unik.
**Catatan:** penugasan ini yang menentukan kelas mana yang boleh diisi & dilihat guru (dipakai RLS `guru_can_write_class`).

---

## 10. Pertemuan Saya (Guru) — `/teacher/meetings`  *(Guru)*

**Tujuan:** daftar pertemuan yang dibuat/diampu guru.

**Daftar (kartu di HP, tabel di desktop):** Tanggal, Sekolah, Kelas, Pertemuan ke-, Guru Pelaksana, indikator jumlah foto.
**Filter:** term (default aktif), sekolah/kelas.
**Aksi utama:** tombol **+ Buat Laporan** (menonjol) → `/teacher/meetings/new`.
**Empty state:** "Belum ada laporan. Buat laporan pertemuan pertamamu."

---

## 11. Form Laporan Pertemuan — `/teacher/meetings/new`  *(Guru)*  ⭐ layar terpenting

**Tujuan:** membuat satu pertemuan + presensi + dokumentasi dalam satu alur.

**Langkah/bagian form:**

**A. Informasi Pertemuan**
- `term_id`: default term aktif (biasanya terkunci).
- `school_id` → `class_id`: dropdown; **hanya kelas yang ditugaskan pada guru** di term itu.
- `meeting_date`: date picker, default hari ini.
- **Pertemuan ke-:** ditampilkan sebagai **preview read-only** (mis. "Pertemuan ke-4"). **JANGAN** jadikan input; nilai final diisi server. Preview boleh dihitung dari max+1 (RPC), tapi jangan dikirim saat insert.
- Guru Utama: tampil otomatis dari `teacher_assignments` (read-only).
- `actual_teacher_id` (**Guru Pelaksana**): dropdown, **default = user login**. Ubah bila yang mengajar orang lain.

**B. Materi**
- `material`: textarea singkat.

**C. Simpan pertemuan → lanjut presensi**
- Setelah bagian A–B disimpan (INSERT `meetings`, tanpa `meeting_number`), **ambil ulang** baris `attendance` yang otomatis dibuat trigger.

**D. Presensi Siswa**
- Tabel/daftar siswa (dari `attendance`, memakai `student_name_snapshot`), semua **default "hadir"**.
- Tiap baris: nama + pilihan status (Hadir/Izin/Sakit/Alpa) — pola cepat: default hadir, guru cukup mengubah yang tidak hadir. Opsional `remarks`.
- Simpan perubahan status per baris.
- **➕ Tambah siswa (saat pertemuan berlangsung):** tombol untuk menangani kasus siswa baru diketahui di lokasi (mis. pertemuan pertama, atau siswa masuk di tengah). Dua mode:
  - *Siswa baru:* isi nama (opsional NIS) → aplikasi membuat `students`, membuat `enrollments` di kelas ini (start_date = tanggal pertemuan), lalu **menambah baris presensi untuk pertemuan ini** (default hadir).
  - *Siswa sudah ada tapi belum ter-enroll:* pilih dari daftar → buat enrollment + baris presensi.
  - Penting: hanya menambah enrollment TIDAK otomatis menambah presensi ke pertemuan yang sudah dibuat; aplikasi harus sekaligus insert baris `attendance` untuk pertemuan berjalan (seed tidak retroaktif). Lihat contoh kode di `README.md` §11.
- **➖ Keluarkan siswa:** aksi untuk menandai siswa tidak lagi mengikuti kelas → isi `end_date` pada enrollment-nya (bukan hapus). Siswa tetap ada di pertemuan yang sudah lewat, tapi tidak muncul di pertemuan berikutnya.
- Guru hanya bisa melakukan ini untuk **kelas yang ia ampu** (dipaksakan RLS).

**E. Dokumentasi**
- Upload **1–2 foto**. Tampilkan preview thumbnail. Tombol upload dinonaktifkan setelah 2 foto (foto ke-3 juga ditolak server).
- Simpan sebagai `meeting_photos.file_path` (path di bucket privat), bukan URL publik.

**Validasi:** sekolah, kelas, tanggal, guru pelaksana wajib. Materi disarankan.
**State:**
- *Loading:* saat menyimpan meeting & mengambil presensi.
- *Error:* jika RLS menolak (guru bukan pengampu) → pesan jelas "Kamu tidak ditugaskan di kelas ini".
- *Sukses:* toast "Laporan tersimpan" → arahkan ke detail.
**Catatan implementasi:** urutan wajib = insert meeting → fetch attendance → edit → upload foto. Jangan render input nomor pertemuan.

---

## 12. Detail & Edit Pertemuan — `/teacher/meetings/[id]`  *(Guru pemilik; Admin; Ketua read-only)*

**Tujuan:** melihat & mengedit satu laporan.

**Tampilan:** info pertemuan (sekolah, kelas, tanggal, pertemuan ke-, guru utama, guru pelaksana), materi, tabel presensi, galeri foto.
**Aksi (guru/admin):** edit materi · ubah status presensi · tambah/hapus foto (batas 2).
**Ketua:** semua tampil **read-only**, tanpa tombol ubah.
**Foto:** tampilkan via **signed URL** (bucket privat).

---

## 13. Monitoring Ketua — `/monitor`  *(Ketua; Admin)*

**Tujuan:** pantau seluruh kegiatan, read-only.

**Ringkasan atas:** total sekolah, guru, kelas, pertemuan (bisa per term/bulan).
**Daftar pertemuan (semua guru):** Tanggal, Guru Pelaksana, Sekolah, Kelas, Pertemuan ke-, Materi (ringkas).
**Filter:** bulan/semester, sekolah, kelas, guru.
**Aksi:** buka detail (memakai layar §12 dalam mode read-only). **Tidak ada** aksi ubah.

---

## 14. Rekap & Export — `/reports`  *(Admin, Ketua)*

**Tujuan:** melihat rekap & mengunduh file bulanan.

**Filter:** bulan & tahun (atau term), sekolah (opsional), guru (opsional).

**Tampilan rekap (on-screen):**
- **Ringkasan mengajar guru:** Pengajar · Sekolah · Jumlah Pertemuan · Tanggal-tanggal. (query A di README §12)
- **Presensi siswa (pivot):** Nama · P1 · P2 · P3 · … per kelas. (query B di README §12)

**Aksi:** tombol **Export ke Excel (.xlsx)** → memanggil Edge Function `export-monthly`.
**Isi file .xlsx (per bulan, saran):** sheet berisi blok Rekap Mengajar Guru, Presensi Siswa (pivot), Materi (tanggal, guru, sekolah, materi), Dokumentasi (tanggal, guru, link foto).
**State:** *loading* saat generate; *sukses* → file terunduh + (opsional) catat ke `export_logs`; *empty* → "Belum ada data untuk periode ini".

---

## 15. Komponen Reusable (saran)

- `DataTable` / `CardList` (responsif tabel↔kartu) dengan slot aksi.
- `SearchInput`, `FilterBar` (sekolah/kelas/term/guru).
- `ConfirmDialog` untuk nonaktifkan.
- `FormModal` / halaman form untuk CRUD master.
- `StatusBadge` (aktif/nonaktif, hadir/izin/sakit/alpa).
- `PhotoUploader` (batas 2, preview, signed URL).
- `AttendanceEditor` (daftar siswa + toggle status cepat + tombol tambah/keluarkan siswa saat pertemuan).
- `EmptyState`, `LoadingState`, `Toast`.

---

## 16. Pola State & Pesan (konsisten)

| State | Perilaku |
|---|---|
| Loading | skeleton/spinner; tombol submit disabled |
| Empty | ilustrasi/teks + ajakan aksi (mis. "Tambahkan yang pertama") |
| Error umum | toast merah + pesan singkat + saran ("coba lagi") |
| Error RLS/izin | pesan spesifik: tindakan tidak diizinkan untuk peranmu |
| Sukses | toast hijau singkat, lalu refresh/redirect |
| Konfirmasi hapus/nonaktif | dialog konfirmasi sebelum eksekusi |
