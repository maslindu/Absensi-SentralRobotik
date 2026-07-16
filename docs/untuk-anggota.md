# Panduan Penggunaan — Presensi & Monitoring Pengajar Komunitas Robotik

> Panduan ini murni langkah-langkah pemakaian per menu. Untuk gambaran umum sistem, baca `ringkasan.md`.

Sistem punya 2 jenis pengguna: **Admin** dan **Guru**. Menu yang muncul di sisi kiri layar menyesuaikan peran akun yang login.

---

## Login

1. Buka alamat aplikasi dari HP/laptop.
2. Masukkan email & password yang sudah dibuatkan admin.
3. Klik **Masuk**.

> Lupa password? Hubungi admin — admin bisa mereset password lewat menu **Guru**.

---

## Menu untuk Admin

### 1. Dashboard
Halaman pertama setelah login. Menampilkan jumlah sekolah, kelas, siswa aktif, dan pertemuan bulan ini — untuk melihat sekilas kondisi terkini tanpa perlu buka menu lain.

### 2. Tahun Ajaran
Untuk mengatur periode semester yang sedang berjalan.
1. Klik **Tambah** untuk membuat tahun ajaran baru (contoh: `2026/2027`, semester Ganjil/Genap).
2. Isi tanggal mulai & selesai (opsional).
3. Klik **Simpan**.
4. Klik **Set Aktif** pada baris tahun ajaran yang sedang berjalan — ini menentukan semester mana yang dipakai sistem untuk nomor pertemuan otomatis, laporan, dsb.

### 3. Sekolah
Daftar sekolah mitra tempat komunitas mengajar.
1. Klik **Tambah** → isi nama sekolah, alamat, dan narahubung.
2. Klik **Edit** untuk mengubah data sekolah yang sudah ada.
3. Klik **Nonaktifkan** jika kerja sama dengan sekolah tersebut berhenti — data lama tetap tersimpan, hanya disembunyikan dari pilihan aktif.

### 4. Kelas
Daftar kelas per sekolah.
1. Klik **Tambah** → pilih sekolah, isi nama kelas (contoh: `7A`) dan tingkat (opsional).
2. Gunakan dropdown **Semua sekolah** di atas tabel untuk memfilter kelas per sekolah.
3. **Edit** / **Nonaktifkan** tersedia per baris, sama seperti menu Sekolah.

### 5. Guru
Kelola akun pengajar.
1. Klik **Tambah Guru** → isi nama, email, dan password awal → klik **Buat Akun**. Akun langsung bisa dipakai login.
2. Klik **Edit** untuk mengubah nama/nomor HP guru.
3. Klik **Reset Password** jika guru lupa password — masukkan password baru, klik **Reset**.
4. Klik **Nonaktifkan** untuk mencabut akses guru yang sudah tidak aktif (misalnya keluar dari komunitas).

### 6. Siswa
Kelola identitas siswa dan keanggotaan kelasnya.
1. Klik **Tambah Siswa** untuk input satu siswa manual (nama, NIS, gender).
2. Klik **Import Excel** untuk menambahkan banyak siswa sekaligus:
   - Siapkan file `.xlsx`, kolom A = Nama, kolom B = NIS (opsional).
   - Pilih kelas & semester tujuan.
   - Klik **Pilih File Excel & Import** — semua nama di file langsung dibuat dan didaftarkan ke kelas tersebut.
3. Klik **Enrollment** pada seorang siswa untuk melihat/mengatur di kelas & semester mana saja siswa itu terdaftar — bisa **Daftarkan** ke kelas baru atau **Keluarkan** dari kelas (riwayat presensi lama tidak hilang).
4. Klik **Edit** untuk mengubah data pribadi siswa.

### 7. Penugasan
Menentukan guru utama tiap kelas per semester — ini yang membuka akses guru untuk mengisi laporan di kelas tersebut.
1. Klik **Tambah** → pilih guru, sekolah, kelas, dan semester.
2. Klik **Simpan**.
3. Klik **Nonaktifkan/Aktifkan** untuk mengatur penugasan yang berubah di tengah jalan (misal ganti guru pengampu).

### 8. Pertemuan (Monitor)
Melihat seluruh laporan pertemuan dari semua guru & sekolah (khusus lihat, tidak bisa mengubah data).
1. Gunakan filter **bulan**, **sekolah**, atau **guru** di atas tabel untuk mempersempit tampilan.
2. Klik tanggal pada salah satu baris untuk membuka detail laporan pertemuan tersebut (materi, presensi, foto).

### 9. Rekap
Membuat & mengunduh laporan bulanan.
1. Pilih **bulan** dan (opsional) **sekolah** yang ingin direkap.
2. Sistem otomatis menampilkan pratinjau: ringkasan mengajar per guru, dan tabel presensi siswa per kelas.
3. Klik **Export Excel (.xlsx)** untuk mengunduh file lengkap — berisi rekap guru, presensi siswa, materi, dan dokumentasi foto.

---

## Menu untuk Guru

### 1. Dashboard
Menampilkan daftar kelas yang diampu pada semester aktif. Ada tombol **Buat Laporan** untuk langsung membuat laporan pertemuan baru.

### 2. Pertemuan Saya
Daftar laporan pertemuan yang sudah pernah dibuat.
1. Gunakan dropdown semester di atas untuk memfilter laporan per semester.
2. Klik salah satu kartu pertemuan untuk membuka & mengedit kembali laporan tersebut.
3. Klik **Buat Laporan** untuk memulai laporan baru — langkahnya:
   1. Pilih **sekolah** lalu **kelas** yang diajar hari ini.
   2. Tanggal pertemuan otomatis terisi hari ini (bisa diubah). Nomor pertemuan otomatis terisi sendiri.
   3. Pastikan **guru pelaksana** sudah benar (default diri sendiri; ubah jika ada guru pengganti).
   4. Isi **materi** yang diajarkan (dan catatan tambahan jika perlu).
   5. Daftar siswa di kelas tersebut otomatis muncul dengan status **Hadir** — klik status siswa yang tidak hadir untuk mengubahnya jadi Izin/Sakit/Alpa.
   6. Kalau ada siswa baru atau siswa yang keluar, isi lewat form "Tambah siswa" langsung di layar ini — tanpa perlu ke menu terpisah.
   7. Klik ikon foto untuk mengunggah dokumentasi kegiatan (maksimal 2 foto).
   8. Klik **Simpan** — laporan tersimpan dan siswa langsung otomatis tercatat presensinya.

### 3. Siswa
Mengelola daftar siswa di kelas yang diampu, di luar alur bikin laporan.
1. Pilih kelas dari dropdown (jika mengampu lebih dari satu kelas).
2. Klik **Tambah Siswa** → pilih **Siswa Baru** (isi nama & NIS) atau **Sudah Terdaftar** (pilih dari siswa yang sudah ada di sistem) → isi tanggal masuk → klik **Tambahkan**.
3. Klik **Keluarkan** pada siswa yang sudah tidak aktif di kelas — presensi lama siswa tersebut tetap tersimpan dan tidak hilang.

---

## Catatan Penting

- **Guru hanya bisa mengisi laporan di kelas yang ditugaskan admin** (menu Penugasan). Jika kelas tidak muncul, minta admin menambahkan penugasan.
- **Data yang "dinonaktifkan"/"dikeluarkan" tidak pernah benar-benar dihapus** — riwayat presensi dan laporan lama tetap bisa dilihat kapan pun.
- Fitur **Export Excel** dan **Monitoring** hanya bisa diakses oleh Admin.
