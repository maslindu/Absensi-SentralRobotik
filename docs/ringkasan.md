# Ringkasan Sistem — Presensi & Monitoring Pengajar Komunitas Robotik Soloraya

> Dokumen ini ditulis untuk dijelaskan ke klien/stakeholder non-teknis. Isinya menjawab: **masalah apa yang diselesaikan, apa saja isi sistemnya, siapa bisa apa, dan bagaimana alur pemakaiannya sehari-hari.** Detail teknis lengkap ada di `PRD.md` dan `README.md` di folder yang sama.

---

## 1. Masalah yang Diselesaikan

Komunitas Robotik Soloraya punya beberapa pengajar yang mengajar ekstrakurikuler robotik di banyak sekolah dan kelas berbeda. Selama ini pencatatan kegiatan mengajar dilakukan manual, sehingga:

- Tidak ada satu tempat yang menyimpan seluruh data kegiatan mengajar.
- Sulit mengetahui siapa guru yang benar-benar mengajar saat terjadi pergantian mendadak.
- Presensi siswa mudah tercecer, apalagi kalau ada siswa yang masuk/keluar di tengah semester.
- Rekap bulanan untuk pengurus komunitas dikerjakan manual dan rawan salah ketik/salah hitung.

**Sistem ini dibuat sebagai satu aplikasi web terpusat** yang bisa dipakai lewat HP maupun laptop untuk mencatat semua itu secara otomatis dan rapi.

---

## 2. Apa Saja yang Bisa Dilakukan Sistem Ini (Fitur Utama)

1. **Login sesuai peran** — Admin dan Guru masing-masing punya tampilan dan hak akses berbeda.
2. **Data master** — kelola daftar sekolah, kelas, guru, dan siswa dari satu tempat.
3. **Tahun ajaran & semester** — sistem tahu semester mana yang sedang aktif; nomor pertemuan otomatis reset tiap ganti semester.
4. **Penugasan guru** — menentukan guru utama untuk tiap kelas per semester.
5. **Laporan pertemuan mengajar** — guru mengisi laporan tiap kali selesai mengajar: tanggal, nomor pertemuan (otomatis), materi yang diajarkan, dan siapa yang benar-benar mengajar (kalau ada guru pengganti, tercatat).
6. **Presensi siswa otomatis** — begitu laporan pertemuan dibuat, semua siswa aktif di kelas itu otomatis tercatat **"hadir"**; guru tinggal mengubah siswa yang izin/sakit/alpa. Guru tidak perlu mengetik ulang daftar siswa setiap kali.
7. **Kelola siswa langsung di lapangan** — guru bisa menambah siswa baru atau menandai siswa keluar langsung dari layar presensi, tanpa menunggu admin. Riwayat presensi siswa lama tetap tersimpan.
8. **Dokumentasi foto** — tiap laporan bisa dilampiri 1–2 foto kegiatan, disimpan aman (tidak bisa diakses sembarang orang).
9. **Monitoring untuk admin** — admin bisa melihat seluruh laporan dari semua guru/sekolah, memfilter berdasarkan bulan/sekolah/guru, tanpa perlu mengubah data guru (khusus lihat saja).
10. **Rekap & export bulanan** — laporan bulanan (rekap mengajar tiap guru + presensi siswa + materi + dokumentasi) bisa diunduh sebagai file **Excel (.xlsx)** dalam hitungan detik.

---

## 3. Siapa Bisa Apa (Peran Pengguna)

Sistem ini punya **2 peran pengguna**: Admin dan Guru.

| Peran | Untuk siapa | Bisa melakukan |
|---|---|---|
| **Admin** | Pengurus komunitas (termasuk ketua) | Mengatur semua data dasar: sekolah, kelas, guru, siswa, penugasan guru, tahun ajaran. Juga bisa memantau seluruh laporan & rekap dari semua guru/sekolah, serta mengunduh export bulanan. Punya kontrol penuh atas seluruh data. |
| **Guru/Pengajar** | Pengajar robotik di lapangan | Login dan hanya melihat kelas yang menjadi tanggung jawabnya. Membuat laporan pertemuan, mengisi presensi, upload foto, serta menambah/mengeluarkan siswa **khusus di kelasnya sendiri**. |

Pembatasan ini bukan cuma tampilan di layar — sudah ditegakkan di level database, jadi walaupun ada yang mencoba "mengakali" lewat cara teknis, sistem tetap menolak akses yang tidak sesuai perannya.

---

## 4. Alur Pemakaian Sehari-hari (Gambaran Singkat)

**Guru selesai mengajar di sekolah:**
1. Buka aplikasi dari HP → login.
2. Pilih sekolah & kelas (hanya kelas yang jadi tanggung jawabnya yang muncul).
3. Isi tanggal mengajar dan materi yang diajarkan — nomor pertemuan otomatis terisi sendiri.
4. Konfirmasi siapa yang benar-benar mengajar (default dirinya sendiri, bisa diganti kalau ada guru pengganti).
5. Daftar siswa muncul otomatis dengan status "hadir" — guru tinggal ubah yang tidak hadir (izin/sakit/alpa).
6. Kalau ada siswa baru atau siswa yang sudah keluar, guru bisa langsung menambah/menandai di layar yang sama.
7. Unggah 1–2 foto dokumentasi kegiatan.
8. Simpan — laporan selesai, biasanya kurang dari 3 menit.

**Admin/pengurus ingin memantau:**
1. Login → buka halaman monitoring.
2. Filter berdasarkan bulan, sekolah, atau guru tertentu.
3. Lihat detail laporan, presensi, dan foto dokumentasi kapan saja tanpa perlu meminta data ke guru.
4. Kalau butuh laporan bulanan lengkap, tinggal klik **Export ke Excel**.

**Admin menyiapkan data di awal semester:**
1. Buat/aktifkan tahun ajaran & semester baru.
2. Pastikan data sekolah, kelas, guru, dan siswa sudah benar.
3. Tetapkan guru utama untuk tiap kelas.
4. Setelah itu, guru bisa langsung mulai mengisi laporan.

---

## 5. Yang Sudah Termasuk vs Belum (Cakupan Saat Ini)

**Sudah termasuk (rilis saat ini/MVP):**
Login & hak akses per peran, kelola data sekolah/kelas/guru/siswa, tahun ajaran & semester, penugasan guru, laporan pertemuan dengan nomor otomatis, pencatatan guru pengganti, presensi otomatis, kelola siswa langsung oleh guru, upload dokumentasi foto, monitoring oleh admin, dan export rekap bulanan ke Excel.

**Belum termasuk (rencana pengembangan lanjutan, di luar rilis saat ini):**
- Penjadwalan mengajar otomatis & deteksi "pertemuan yang seharusnya ada tapi bolong".
- Integrasi langsung ke Google Sheets.
- Dashboard statistik/grafik visual.
- Export ke PDF.
- Notifikasi otomatis (misalnya lewat WhatsApp).
- Kalender akademik.
- Aplikasi Android terpisah (saat ini cukup dibuka lewat browser HP, sudah responsif).
- Fitur penilaian akademik atau pembayaran — di luar cakupan sistem ini sejak awal.

---

## 6. Kenapa Sistem Ini Bisa Dipercaya Datanya

- **Satu sumber data.** Semua kegiatan tercatat di database aplikasi; file Excel hanya hasil cetak/laporan, bukan tempat data "asli" disimpan.
- **Data lama tidak pernah hilang.** Kalau ada siswa pindah/keluar atau sekolah/kelas tidak aktif lagi, datanya **tidak dihapus** — hanya ditandai nonaktif, supaya riwayat presensi dan laporan lama tetap utuh dan bisa dilihat kapan pun.
- **Nomor pertemuan tidak bisa salah/ganda.** Dihitung otomatis oleh sistem, bukan diketik manual oleh guru.
- **Foto dokumentasi disimpan privat.** Tidak bisa diakses publik/orang luar.
- **Setiap peran hanya bisa melakukan apa yang berhak dilakukannya**, ditegakkan secara teknis di database, bukan cuma disembunyikan di tampilan.

---

## 7. Ringkasan untuk Disampaikan ke Klien

> "Sistem ini menggantikan pencatatan manual kegiatan mengajar robotik dengan satu aplikasi web yang bisa diisi guru dari HP dalam hitungan menit. Setiap laporan otomatis mencatat presensi siswa, materi, dan foto dokumentasi. Admin/pengurus bisa memantau seluruh kegiatan dari semua sekolah kapan saja, dan rekap bulanan bisa diunduh sebagai file Excel tanpa perlu menyusun manual lagi. Data siswa yang keluar-masuk di tengah semester tetap tercatat rapi tanpa merusak riwayat presensi lama."

