-- =============================================================================
-- STORAGE — bucket dokumentasi foto (PRIVAT) + policy
-- Jalankan SETELAH schema.sql, di Supabase SQL Editor.
-- Foto memuat wajah anak-anak -> bucket WAJIB privat (public = false).
-- =============================================================================

-- 1) Buat bucket privat
insert into storage.buckets (id, name, public)
values ('meeting-documentation', 'meeting-documentation', false)
on conflict (id) do nothing;

-- 2) Policy pada storage.objects
--    Konvensi path yang disarankan: '{meeting_id}/{namafile}'

-- Baca: semua anggota komunitas yang login boleh melihat (bucket tetap privat,
-- file hanya bisa diakses via Supabase client / signed URL, tidak publik).
create policy "docs_read"
on storage.objects for select to authenticated
using (bucket_id = 'meeting-documentation');

-- Upload: user yang login boleh mengunggah ke bucket ini.
create policy "docs_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'meeting-documentation');

-- Hapus: user yang login (idealnya batasi ke admin/guru pemilik di aplikasi).
create policy "docs_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'meeting-documentation');

-- =============================================================================
-- CATATAN
-- * Untuk kontrol lebih ketat (mis. hanya guru pemilik pertemuan yang boleh
--   upload/hapus), path bisa memuat meeting_id lalu policy mengecek relasi ke
--   tabel meetings. Untuk MVP komunitas kecil, policy di atas sudah memadai.
-- * Saat menampilkan foto, buat signed URL dari sisi server:
--     supabase.storage.from('meeting-documentation').createSignedUrl(path, 3600)
-- =============================================================================
