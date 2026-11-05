-- =============================================================================
-- MIGRASI: Nilai & progres siswa per pertemuan
--
-- Setiap baris presensi kini bisa membawa penilaian. KEDUANYA OPSIONAL dan
-- berdiri sendiri, jadi tidak ada "mode penilaian" yang perlu diatur:
--   * score    = nilai angka 0-100 (untuk pengajar yang menilai dengan angka)
--   * progress = berkembang / cukup / belum (untuk penilaian cepat di lapangan)
-- Pengajar memakai yang ia butuhkan; rekap menampilkan kolom yang terisi.
--
-- Tidak ada perubahan RLS: policy attendance_write/attendance_select sudah
-- berlaku per baris, sehingga kolom baru otomatis ikut hak akses pertemuan.
-- =============================================================================

alter table attendance add column if not exists score    numeric(5,2);
alter table attendance add column if not exists progress text;

alter table attendance drop constraint if exists attendance_score_range;
alter table attendance add constraint attendance_score_range
  check (score is null or (score >= 0 and score <= 100));

alter table attendance drop constraint if exists attendance_progress_valid;
alter table attendance add constraint attendance_progress_valid
  check (progress is null or progress in ('berkembang', 'cukup', 'belum'));

-- Rekap nilai selalu diambil per kelas+semester lewat meetings, lalu
-- attendance di-filter dengan `in (meeting_id)`. Index meeting_id sudah ada.
