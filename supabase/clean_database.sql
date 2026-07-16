-- Script untuk mereset/membersihkan database, menyisakan HANYA akun admin.
-- Gunakan script ini di Supabase SQL Editor untuk memulai data dari awal (0).

BEGIN;

-- 1. Hapus semua data transaksional dan master (kecuali roles & profiles admin)
-- TRUNCATE dengan CASCADE akan memastikan seluruh data yang bergantung juga ikut terhapus dengan aman
TRUNCATE TABLE public.export_logs CASCADE;
TRUNCATE TABLE public.attendance CASCADE;
TRUNCATE TABLE public.meeting_photos CASCADE;
TRUNCATE TABLE public.meetings CASCADE;
TRUNCATE TABLE public.enrollments CASCADE;
TRUNCATE TABLE public.students CASCADE;
TRUNCATE TABLE public.teacher_assignments CASCADE;
TRUNCATE TABLE public.classes CASCADE;
TRUNCATE TABLE public.schools CASCADE;
TRUNCATE TABLE public.academic_terms CASCADE;

-- 2. Hapus semua pengguna dari sistem Autentikasi (auth.users) yang BUKAN admin.
-- Karena `public.profiles` terhubung dengan `auth.users` menggunakan ON DELETE CASCADE,
-- maka profil guru/anggota otomatis akan ikut terhapus secara bersih.
DELETE FROM auth.users
WHERE id NOT IN (
    SELECT p.id 
    FROM public.profiles p 
    JOIN public.roles r ON p.role_id = r.id 
    WHERE r.name = 'admin'
);

COMMIT;
