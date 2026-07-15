# PRD — Sistem Presensi & Monitoring Pengajar Komunitas Robotik Soloraya

> Dokumen ini melengkapi `README.md` (arsitektur & teknis) dengan sudut pandang produk: masalah, tujuan terukur, user story, dan kriteria penerimaan. Dipakai untuk menentukan *apa yang harus jalan* dan *kapan sebuah fitur dianggap selesai*.

**Status:** MVP · **Versi:** 1.0 · **Sumber kebenaran teknis:** `schema.sql`, `README.md`

---

## 1. Latar Belakang & Masalah

Komunitas Robotik Soloraya punya beberapa pengajar yang mengajar ekstrakurikuler robotik di banyak sekolah dan kelas. Saat ini pencatatan kegiatan mengajar masih manual, sehingga sulit memonitor kehadiran guru, kehadiran siswa, materi, dan dokumentasi — dan sulit membuat rekap bulanan untuk ketua komunitas.

**Masalah yang diselesaikan:**
- Tidak ada pusat data kegiatan mengajar → sulit evaluasi & rekap.
- Sulit tahu siapa guru yang benar-benar mengajar saat ada penggantian.
- Presensi siswa tercecer, apalagi saat ada siswa masuk/keluar di tengah semester.
- Rekap bulanan dikerjakan manual dan rawan salah.

---

## 2. Tujuan & Metrik Keberhasilan

| Tujuan | Metrik keberhasilan |
|---|---|
| Mempermudah pencatatan pertemuan | Guru bisa menyelesaikan 1 laporan pertemuan < 3 menit di HP |
| Data terpusat & akurat | 100% pertemuan tercatat di database; tidak ada rekap manual paralel |
| Monitoring mudah bagi ketua | Ketua bisa melihat rekap bulanan tanpa minta data ke guru |
| Histori tidak hilang | Siswa keluar/pindah tidak menghapus presensi lama |
| Rekap otomatis | Rekap 1 bulan bisa di-export ke .xlsx dalam < 1 menit |

**Non-goals (di luar tujuan):** penilaian akademik, pembayaran, kurikulum, aplikasi Android native, notifikasi otomatis.

---

## 3. Persona Pengguna

**Admin (pengurus komunitas).** Menyiapkan & merapikan semua data master, menetapkan guru, menambah/mengeluarkan siswa. Butuh kontrol penuh.

**Guru/Pengajar.** Mengisi laporan di lapangan, sering lewat HP, ingin cepat & sederhana. Kadang menggantikan guru lain. Sering jadi pihak pertama yang tahu daftar siswa, jadi perlu bisa menambah/mengeluarkan siswa di kelasnya sendiri tanpa menunggu admin.

**Ketua Komunitas.** Ingin memantau semua kegiatan dan menarik rekap bulanan, tanpa perlu mengubah data.

---

## 4. Cakupan Rilis

### MVP (rilis pertama)
Login & role · manajemen tahun ajaran/semester · CRUD sekolah, kelas, guru, siswa · enrollment siswa (masuk/keluar tengah semester) · penugasan guru utama · laporan pertemuan (nomor otomatis, reset per semester) · guru utama vs guru pelaksana · presensi siswa (auto-seed, default hadir) · upload dokumentasi (maks 2 foto) · monitoring ketua (read-only) · export rekap bulanan (.xlsx).

### Fase berikutnya (tidak di MVP)
Jadwal mengajar & deteksi pertemuan bolong · integrasi Google Sheets API · dashboard statistik/grafik · export PDF · notifikasi/WhatsApp · kalender akademik · riwayat pergantian guru.

---

## 5. User Stories & Kriteria Penerimaan

Prioritas: **P0** = wajib MVP, **P1** = sangat diinginkan, **P2** = opsional.

### 5.1 Autentikasi & Akses

**US-01 (P0)** — Sebagai pengguna, saya ingin login dengan email & password agar bisa mengakses sistem sesuai peran saya.
- Login berhasil mengarahkan ke dashboard sesuai role (admin/guru/ketua).
- Login gagal menampilkan pesan error yang jelas.
- Pengguna tanpa sesi tidak bisa membuka halaman internal (diarahkan ke login).

**US-02 (P0)** — Sebagai sistem, saya ingin membatasi akses per peran agar data hanya bisa diubah oleh yang berhak.
- Ketua tidak bisa membuat/mengubah/menghapus data apa pun (hanya baca).
- Guru hanya bisa membuat/mengubah laporan **dan mengelola roster siswa** untuk kelas yang ditugaskan padanya.
- Pembatasan ditegakkan di database (RLS), bukan hanya UI. (Sudah diuji: guru ditolak saat mencoba menulis di kelas yang bukan miliknya.)

### 5.2 Manajemen Master (Admin)

**US-03 (P0)** — Sebagai admin, saya ingin CRUD sekolah, kelas, guru, dan siswa agar data master siap dipakai.
- Bisa menambah, mengubah, menonaktifkan (bukan hapus permanen), dan melihat daftar.
- Data yang dinonaktifkan tidak muncul di pilihan aktif, tapi tetap tersimpan.
- Admin tetap punya kontrol penuh atas seluruh siswa (lintas kelas/sekolah), termasuk yang ditambahkan guru.

**US-04 (P0)** — Sebagai admin, saya ingin mengelola tahun ajaran & semester agar penomoran pertemuan dan enrollment mengikuti periode yang benar.
- Bisa membuat term (mis. 2025/2026 Ganjil) dan menandai satu term sebagai aktif.
- Nomor pertemuan tereset saat pindah semester.

**US-05 (P0)** — Sebagai admin **atau guru pengampu**, saya ingin mendaftarkan siswa ke kelas per semester (enrollment) agar presensi selalu mengikuti anggota kelas yang benar.
- Bisa menambah siswa ke kelas dengan tanggal mulai.
- Bisa menandai siswa keluar dengan mengisi tanggal selesai — presensi lama tetap ada.
- **Guru hanya boleh mengelola roster kelas yang ditugaskan padanya** (ditegakkan RLS); tidak bisa menyentuh kelas guru lain.
- Menghapus enrollment tetap hak admin (untuk menjaga histori); guru "mengeluarkan" siswa dengan mengisi tanggal selesai, bukan menghapus.

**US-05b (P0)** — Sebagai guru, saya ingin menambah/menonaktifkan siswa **saat pembelajaran berlangsung** tanpa menunggu admin, agar tidak terhambat bila daftar siswa baru diketahui di pertemuan pertama atau ada perubahan di tengah semester.
- Guru bisa membuat identitas siswa baru dan langsung meng-enroll ke kelas yang ia ampu.
- Saat guru menambah siswa **di layar presensi pertemuan yang sedang berjalan**, siswa itu langsung muncul di presensi pertemuan tersebut (default hadir).
- Guru bisa menandai siswa keluar (isi tanggal selesai) sehingga tidak muncul di pertemuan berikutnya, tetapi presensi sebelumnya tetap utuh.
- Semua perubahan roster oleh guru terbatas pada kelasnya sendiri.

**US-06 (P0)** — Sebagai admin, saya ingin menetapkan guru utama untuk tiap kelas per semester agar jadwal jelas.
- Penugasan tersimpan per (guru, kelas, term).
- Guru utama muncul otomatis saat laporan dibuat.

### 5.3 Laporan Mengajar (Guru)

**US-07 (P0)** — Sebagai guru, saya ingin melihat hanya kelas yang saya ampu agar tidak salah pilih.
- Daftar kelas dibatasi sesuai `teacher_assignments` guru pada term aktif.

**US-08 (P0)** — Sebagai guru, saya ingin membuat laporan pertemuan dengan nomor otomatis agar tidak perlu menghitung manual.
- `meeting_number` diisi otomatis oleh server; guru tidak mengetiknya.
- Nomor benar sesuai urutan kelas+semester walau dua guru mengisi berdekatan.

**US-09 (P0)** — Sebagai guru, saya ingin memilih guru pelaksana bila bukan saya yang mengajar agar histori penggantian tercatat.
- Default guru pelaksana = guru yang login.
- Guru utama & pelaksana tersimpan terpisah dan keduanya terlihat di laporan.

**US-10 (P0)** — Sebagai guru, saya ingin presensi otomatis terisi "hadir" untuk semua siswa aktif agar saya cukup mengubah yang tidak hadir.
- Saat pertemuan dibuat, semua siswa aktif kelas itu muncul berstatus hadir.
- Status bisa diubah ke izin/sakit/alpa; opsional beri keterangan.
- Siswa yang masuk setelah tanggal pertemuan tidak muncul pada pertemuan sebelumnya.

**US-11 (P0)** — Sebagai guru, saya ingin mengisi materi dan mengunggah 1–2 foto dokumentasi agar kegiatan terbukti.
- Materi berupa teks singkat.
- Bisa unggah 1 atau 2 foto; foto ke-3 ditolak.
- Foto tersimpan privat, tidak bisa diakses publik.

**US-12 (P1)** — Sebagai guru, saya ingin melihat & mengubah laporan yang sudah saya buat agar bisa memperbaiki kesalahan.
- Guru bisa membuka detail pertemuannya dan mengedit materi/presensi/foto.

### 5.4 Monitoring & Rekap

**US-13 (P0)** — Sebagai ketua, saya ingin melihat seluruh laporan dan memfilter agar bisa memonitor.
- Bisa filter berdasarkan bulan/semester, sekolah, kelas, guru.
- Bisa membuka detail materi, dokumentasi, dan presensi. Tidak bisa mengubah.

**US-14 (P0)** — Sebagai ketua/admin, saya ingin melihat ringkasan mengajar per guru (jumlah pertemuan, tanggal, sekolah) agar bisa mengevaluasi keaktifan.
- Rekap menampilkan: pengajar, sekolah, jumlah pertemuan, daftar tanggal.

**US-15 (P0)** — Sebagai ketua/admin, saya ingin export rekap bulanan ke .xlsx agar mudah diarsipkan/dibagikan.
- Satu file per bulan berisi rekap mengajar guru + presensi siswa (pivot P1, P2, …) + materi + link dokumentasi.
- Data di file sesuai isi database saat itu.

---

## 6. Aturan Bisnis (ringkas)

- Satu pertemuan tepat satu guru pelaksana.
- Nomor pertemuan otomatis & reset per semester; tidak diisi manual.
- Data master tidak dihapus permanen (pakai nonaktif / end_date).
- Roster kelas (enrollment) boleh dikelola admin **dan** guru pengampu kelas itu; guru dibatasi hanya pada kelasnya sendiri.
- Presensi mengikuti siswa aktif pada tanggal pertemuan.
- Default presensi = hadir.
- Excel/Sheets hanya output; database adalah sumber kebenaran.

(Detail teknis & pemaksaan lewat trigger/RLS ada di `README.md` §7–8 dan `schema.sql`.)

---

## 7. Kebutuhan Non-Fungsional

- **Responsif:** nyaman di HP & laptop; form guru dioptimalkan untuk HP.
- **Keamanan:** akses dibatasi per role via RLS; foto anak disimpan di bucket privat.
- **Reliabilitas:** histori pertemuan & presensi tidak hilang.
- **Skalabilitas:** siap saat sekolah/kelas/guru bertambah.
- **Kemudahan:** alur pengisian sederhana & minim langkah.
- **Bahasa:** antarmuka Bahasa Indonesia.

---

## 8. Asumsi & Batasan

- Jumlah pengguna kecil (komunitas), trafik rendah — tier gratis Supabase cukup untuk awal.
- Guru dianggap saling percaya; guru boleh melihat data kelas yang diampu, tidak perlu isolasi ketat antar guru.
- Satu siswa berada di satu kelas per semester (untuk konteks ini).
- Export awal cukup .xlsx; Google Sheets API menyusul.

---

## 9. Rencana Rilis (milestone)

| Milestone | Isi | Selesai bila |
|---|---|---|
| M1 — Fondasi & Auth | Setup, login, guard role | 3 role bisa login & diarahkan benar |
| M2 — Master Admin | terms, sekolah, kelas, guru, siswa, enrollment, assignment | Admin bisa menyiapkan semua data untuk 1 sekolah |
| M3 — Laporan Guru | form pertemuan, presensi, foto | Guru menyelesaikan laporan lengkap end-to-end |
| M4 — Monitoring Ketua | daftar, filter, detail read-only | Ketua melihat semua tanpa bisa mengubah |
| M5 — Rekap & Export | halaman reports + export .xlsx | File bulanan ter-generate benar |
| M6 — Polish | validasi, empty/loading state, mobile | Layak dipakai komunitas |

---

## 10. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| AI/dev mengirim `meeting_number` manual | Ditegaskan di README & UI spec: nomor dari server |
| Presensi tidak muncul | Pastikan enrollment aktif sebelum buat pertemuan |
| Dokumen lama (Laravel) menimbulkan konflik | Arsipkan `API_Endpoint...md` & panduan Laravel |
| Foto anak bocor | Bucket privat + signed URL |
| MVP tak bisa deteksi pertemuan bolong | Diterima sebagai batasan MVP; tabel jadwal di fase berikut |
