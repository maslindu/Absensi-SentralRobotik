-- =============================================================================
-- SKEMA DATABASE — Sistem Presensi & Monitoring Pengajar Komunitas Robotik Soloraya
-- Target   : Supabase (PostgreSQL) — Auth + Database + Storage
-- Arsitektur: Next.js (frontend) + Supabase (Auth/DB/Storage) + Edge Function (export)
--
-- Prinsip desain:
--  * Sumber kebenaran = database ini. Google Sheets/Excel hanya OUTPUT laporan.
--  * Nomor pertemuan RESET setiap semester (per kelas per semester).
--  * Siswa boleh masuk/keluar di tengah semester -> pakai tabel enrollment berdurasi.
--  * Data master tidak dihapus permanen -> gunakan is_active / status.
--  * Presensi disimpan dengan SNAPSHOT nama siswa agar rekap lama tetap akurat.
--  * Keamanan ditegakkan RLS sesuai role: admin (kelola semua), guru (isi laporan
--    kelas yang diampu), ketua (hanya baca).
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- ENUM
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'semester_type') then
    create type semester_type as enum ('ganjil', 'genap');
  end if;
  if not exists (select 1 from pg_type where typname = 'student_status') then
    create type student_status as enum ('aktif', 'nonaktif');
  end if;
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type attendance_status as enum ('hadir', 'izin', 'sakit', 'alpa');
  end if;
end$$;

-- =============================================================================
-- HELPER: trigger updated_at
-- =============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- ROLES  (tabel kecil; nama peran: admin / guru / ketua)
-- =============================================================================
create table if not exists roles (
  id   uuid primary key default gen_random_uuid(),
  name text unique not null
);
-- Catatan: role 'ketua' dihapus — fiturnya sudah tercakup di 'admin'.
insert into roles(name) values ('admin'),('guru')
on conflict (name) do nothing;

-- =============================================================================
-- PROFILES  (perluasan auth.users bawaan Supabase Auth)
-- =============================================================================
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role_id    uuid not null references roles(id) on delete restrict,
  full_name  text not null,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_role_id on profiles(role_id);

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at before update on profiles
for each row execute function set_updated_at();

-- =============================================================================
-- ACADEMIC TERMS  (semester + tahun ajaran)
--   Contoh: year_label='2025/2026', semester='ganjil'
--   Nomor pertemuan & enrollment siswa selalu terikat ke term.
-- =============================================================================
create table if not exists academic_terms (
  id         uuid primary key default gen_random_uuid(),
  year_label text not null,             -- '2025/2026'
  semester   semester_type not null,    -- ganjil / genap
  start_date date,
  end_date   date,
  is_active  boolean not null default true,   -- term yang sedang berjalan
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year_label, semester)
);

drop trigger if exists trg_terms_updated_at on academic_terms;
create trigger trg_terms_updated_at before update on academic_terms
for each row execute function set_updated_at();

-- =============================================================================
-- SCHOOLS
-- =============================================================================
create table if not exists schools (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  address        text,
  contact_person text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_schools_updated_at on schools;
create trigger trg_schools_updated_at before update on schools
for each row execute function set_updated_at();

-- =============================================================================
-- CLASSES  (kelas milik sekolah; nama kelas bisa beda-beda tiap sekolah)
--   "Kelas 7" dipakai lintas semester; keanggotaan siswa yg berubah,
--   bukan record kelasnya.
-- =============================================================================
create table if not exists classes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,        -- '7', '7A', '8B'
  grade_level text,                 -- opsional
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists idx_classes_school_id on classes(school_id);

drop trigger if exists trg_classes_updated_at on classes;
create trigger trg_classes_updated_at before update on classes
for each row execute function set_updated_at();

-- =============================================================================
-- TEACHER ASSIGNMENTS  (guru UTAMA per kelas per semester)
--   Terikat term karena penugasan bisa berganti tiap tahun ajaran.
-- =============================================================================
create table if not exists teacher_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references profiles(id) on delete cascade,
  school_id   uuid not null references schools(id) on delete cascade,
  class_id    uuid not null references classes(id) on delete cascade,
  term_id     uuid not null references academic_terms(id) on delete cascade,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (teacher_id, class_id, term_id)
);
create index if not exists idx_ta_teacher on teacher_assignments(teacher_id);
create index if not exists idx_ta_class   on teacher_assignments(class_id);
create index if not exists idx_ta_term    on teacher_assignments(term_id);

drop trigger if exists trg_ta_updated_at on teacher_assignments;
create trigger trg_ta_updated_at before update on teacher_assignments
for each row execute function set_updated_at();

-- =============================================================================
-- STUDENTS  (identitas siswa; tidak dihapus, cukup nonaktif)
-- =============================================================================
create table if not exists students (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  nis        text,
  gender     text,
  status     student_status not null default 'aktif',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_students_name on students(full_name);

drop trigger if exists trg_students_updated_at on students;
create trigger trg_students_updated_at before update on students
for each row execute function set_updated_at();

-- =============================================================================
-- STUDENT ENROLLMENTS  (siswa X ada di kelas Y pada semester Z)
--   Inilah yang menangani "siswa masuk/keluar di tengah semester".
--   start_date/end_date menandai periode aktif.
--   on delete RESTRICT pada student -> siswa tak bisa dihapus jika ada histori.
-- =============================================================================
create table if not exists enrollments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  class_id   uuid not null references classes(id) on delete cascade,
  term_id    uuid not null references academic_terms(id) on delete cascade,
  start_date date not null default current_date,
  end_date   date,                       -- diisi saat siswa keluar
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, class_id, term_id)
);
create index if not exists idx_enroll_class_term on enrollments(class_id, term_id);
create index if not exists idx_enroll_student    on enrollments(student_id);

drop trigger if exists trg_enroll_updated_at on enrollments;
create trigger trg_enroll_updated_at before update on enrollments
for each row execute function set_updated_at();

-- =============================================================================
-- MEETINGS  (satu baris per pertemuan mengajar)
--   scheduled_teacher_id = guru utama/terjadwal
--   actual_teacher_id    = guru yang benar-benar mengajar (pengganti bila beda)
--   meeting_number       = otomatis, reset per (class_id, term_id)
-- =============================================================================
create table if not exists meetings (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references schools(id) on delete cascade,
  class_id             uuid not null references classes(id) on delete cascade,
  term_id              uuid not null references academic_terms(id) on delete restrict,
  scheduled_teacher_id uuid references profiles(id) on delete set null,
  actual_teacher_id    uuid not null references profiles(id) on delete restrict,
  meeting_date         date not null,
  meeting_number       integer,          -- diisi otomatis oleh trigger
  material             text,             -- materi singkat
  notes                text,
  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (class_id, term_id, meeting_number)
);
create index if not exists idx_meetings_class_term on meetings(class_id, term_id);
create index if not exists idx_meetings_school      on meetings(school_id);
create index if not exists idx_meetings_date        on meetings(meeting_date);
create index if not exists idx_meetings_actual      on meetings(actual_teacher_id);

drop trigger if exists trg_meetings_updated_at on meetings;
create trigger trg_meetings_updated_at before update on meetings
for each row execute function set_updated_at();

-- ---- Auto meeting_number (reset per class+term), aman dari race condition -----
create or replace function set_meeting_number()
returns trigger language plpgsql as $$
begin
  if new.meeting_number is null then
    -- kunci per (kelas, term) agar dua guru submit bersamaan tidak dapat nomor kembar
    perform pg_advisory_xact_lock(hashtext(new.class_id::text || ':' || new.term_id::text));
    select coalesce(max(meeting_number), 0) + 1
      into new.meeting_number
      from meetings
     where class_id = new.class_id and term_id = new.term_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_meeting_number on meetings;
create trigger trg_meeting_number before insert on meetings
for each row execute function set_meeting_number();

-- =============================================================================
-- MEETING PHOTOS  (dokumentasi; simpan PATH storage, maksimum 2 foto)
-- =============================================================================
create table if not exists meeting_photos (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  file_path   text not null,        -- path di bucket privat 'meeting-documentation'
  sort_order  smallint not null default 1,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_photos_meeting on meeting_photos(meeting_id);

-- Batasi maksimum 2 foto per pertemuan
create or replace function enforce_photo_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from meeting_photos where meeting_id = new.meeting_id) >= 2 then
    raise exception 'Maksimum 2 foto dokumentasi per pertemuan';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_photo_limit on meeting_photos;
create trigger trg_photo_limit before insert on meeting_photos
for each row execute function enforce_photo_limit();

-- =============================================================================
-- ATTENDANCE  (presensi siswa per pertemuan; snapshot nama untuk rekap historis)
-- =============================================================================
create table if not exists attendance (
  id                    uuid primary key default gen_random_uuid(),
  meeting_id            uuid not null references meetings(id) on delete cascade,
  student_id            uuid not null references students(id) on delete restrict,
  student_name_snapshot text not null,        -- nama pada saat pertemuan dibuat
  status                attendance_status not null default 'hadir',
  remarks               text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (meeting_id, student_id)
);
create index if not exists idx_attendance_meeting on attendance(meeting_id);
create index if not exists idx_attendance_student on attendance(student_id);

drop trigger if exists trg_attendance_updated_at on attendance;
create trigger trg_attendance_updated_at before update on attendance
for each row execute function set_updated_at();

-- ---- Auto-generate baris presensi (default 'hadir') untuk siswa aktif ---------
--  Saat pertemuan dibuat, semua siswa yang aktif terdaftar di kelas+term itu
--  langsung dibuatkan baris presensi 'hadir'. Guru tinggal ubah yg tidak hadir.
create or replace function seed_attendance()
returns trigger language plpgsql as $$
begin
  insert into attendance (meeting_id, student_id, student_name_snapshot, status)
  select new.id, s.id, s.full_name, 'hadir'
    from enrollments e
    join students s on s.id = e.student_id
   where e.class_id = new.class_id
     and e.term_id  = new.term_id
     and e.is_active = true
     and e.start_date <= new.meeting_date
     and (e.end_date is null or e.end_date >= new.meeting_date)
     and s.status = 'aktif'
  on conflict (meeting_id, student_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_attendance on meetings;
create trigger trg_seed_attendance after insert on meetings
for each row execute function seed_attendance();

-- =============================================================================
-- GOOGLE SHEET / EXPORT LOG  (opsional; audit sinkronisasi bulanan)
-- =============================================================================
create table if not exists export_logs (
  id          uuid primary key default gen_random_uuid(),
  period      text not null,           -- '2026-07'
  sheet_url   text,
  status      text not null default 'success',   -- success/failed/pending
  exported_by uuid references profiles(id) on delete set null,
  exported_at timestamptz not null default now(),
  notes       text
);
create index if not exists idx_export_period on export_logs(period);

-- =============================================================================
-- FUNGSI HELPER RLS  (SECURITY DEFINER agar bisa baca profiles tanpa memicu
-- rekursi policy). search_path dikunci untuk keamanan.
-- =============================================================================
create or replace function auth_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select r.name
    from profiles p
    join roles r on r.id = p.role_id
   where p.id = auth.uid() and p.is_active = true
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'admin'
$$;

create or replace function is_ketua() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'ketua'
$$;

create or replace function is_guru() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'guru'
$$;

-- Guru boleh menulis laporan bila: admin, ATAU guru yang ditugaskan di kelas itu,
-- ATAU guru yang tercatat sebagai pelaksana pertemuan.
create or replace function guru_can_write_class(p_class_id uuid, p_term_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (
        select 1 from teacher_assignments ta
         where ta.teacher_id = auth.uid()
           and ta.class_id = p_class_id
           and ta.term_id  = p_term_id
           and ta.is_active = true
      )
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table roles                enable row level security;
alter table profiles             enable row level security;
alter table academic_terms       enable row level security;
alter table schools              enable row level security;
alter table classes              enable row level security;
alter table teacher_assignments  enable row level security;
alter table students             enable row level security;
alter table enrollments          enable row level security;
alter table meetings             enable row level security;
alter table meeting_photos       enable row level security;
alter table attendance           enable row level security;
alter table export_logs          enable row level security;

-- ---------- ROLES : semua yg login boleh baca, admin kelola ----------
create policy roles_read  on roles for select to authenticated using (true);
create policy roles_admin on roles for all    to authenticated
  using (is_admin()) with check (is_admin());

-- ---------- PROFILES ----------
-- Semua yg login bisa baca (perlu untuk menampilkan nama guru pd laporan).
create policy profiles_read on profiles for select to authenticated using (true);
-- User mengubah profil sendiri (tapi tidak boleh mengubah role -> lihat catatan).
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Admin kelola semua profil.
create policy profiles_admin on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------- MASTER DATA (schools, classes, terms, teacher_assignments) :
--            semua login boleh SELECT; hanya admin menulis.
-- Ketua otomatis tercakup (hanya select). Guru bisa select untuk memilih data.
-- CATATAN: students & enrollments TIDAK di sini karena guru juga boleh menulis
--          (lihat blok berikutnya).
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'academic_terms','schools','classes','teacher_assignments'
  ] loop
    execute format(
      'create policy %1$s_read on %1$s for select to authenticated using (true);', tbl);
    execute format(
      'create policy %1$s_admin on %1$s for all to authenticated using (is_admin()) with check (is_admin());', tbl);
  end loop;
end$$;

-- ---------- STUDENTS ----------
-- Guru sering jadi pihak pertama yang tahu daftar siswa (mis. pertemuan pertama).
-- Maka guru boleh membuat identitas siswa & memperbaiki data siswa di kelasnya,
-- tanpa harus menunggu admin. Global status siswa tetap dikelola admin;
-- "mengeluarkan" siswa dari kelas dilakukan lewat enrollments (end_date).
create policy students_read on students for select to authenticated using (true);
-- Admin: kelola penuh.
create policy students_admin on students for all to authenticated
  using (is_admin()) with check (is_admin());
-- Guru & admin: boleh membuat identitas siswa baru.
create policy students_insert on students for insert to authenticated
  with check (is_admin() or is_guru());
-- Guru: boleh memperbaiki data siswa yang ter-enroll di kelas yang ia ampu.
create policy students_update_guru on students for update to authenticated
  using (
    exists (
      select 1 from enrollments e
      join teacher_assignments ta
        on ta.class_id = e.class_id and ta.term_id = e.term_id
      where e.student_id = students.id
        and ta.teacher_id = auth.uid()
        and ta.is_active = true
    )
  )
  with check (
    exists (
      select 1 from enrollments e
      join teacher_assignments ta
        on ta.class_id = e.class_id and ta.term_id = e.term_id
      where e.student_id = students.id
        and ta.teacher_id = auth.uid()
        and ta.is_active = true
    )
  );

-- ---------- ENROLLMENTS ----------
-- Ini "roster kelas per semester". Guru boleh menambah/mengubah keanggotaan
-- (masuk di awal/tengah semester, atau keluar via end_date) HANYA untuk kelas
-- yang ditugaskan padanya. Menghapus enrollment tetap hak admin (jaga histori).
create policy enrollments_read on enrollments for select to authenticated using (true);
create policy enrollments_admin on enrollments for all to authenticated
  using (is_admin()) with check (is_admin());
-- Guru: tambah siswa ke kelas yang ia ampu (semester itu).
create policy enrollments_insert_guru on enrollments for insert to authenticated
  with check (guru_can_write_class(class_id, term_id));
-- Guru: ubah enrollment (mis. isi end_date untuk mengeluarkan siswa) di kelasnya.
create policy enrollments_update_guru on enrollments for update to authenticated
  using (guru_can_write_class(class_id, term_id))
  with check (guru_can_write_class(class_id, term_id));

-- ---------- MEETINGS ----------
-- SELECT: admin & ketua lihat semua; guru lihat pertemuan kelas yg diampu / yg ia laksanakan.
create policy meetings_select on meetings for select to authenticated
using (
  is_admin() or is_ketua()
  or actual_teacher_id = auth.uid()
  or scheduled_teacher_id = auth.uid()
  or exists (
       select 1 from teacher_assignments ta
        where ta.teacher_id = auth.uid()
          and ta.class_id = meetings.class_id
          and ta.term_id  = meetings.term_id
          and ta.is_active = true)
);
-- INSERT/UPDATE: admin atau guru yg berhak atas kelas+term.
create policy meetings_insert on meetings for insert to authenticated
  with check (guru_can_write_class(class_id, term_id));
create policy meetings_update on meetings for update to authenticated
  using (guru_can_write_class(class_id, term_id))
  with check (guru_can_write_class(class_id, term_id));
-- DELETE: admin saja.
create policy meetings_delete on meetings for delete to authenticated
  using (is_admin());

-- ---------- ATTENDANCE (ikut hak akses pertemuan induk) ----------
create policy attendance_select on attendance for select to authenticated
using (
  exists (select 1 from meetings m where m.id = attendance.meeting_id and (
      is_admin() or is_ketua()
      or m.actual_teacher_id = auth.uid()
      or m.scheduled_teacher_id = auth.uid()
      or exists (select 1 from teacher_assignments ta
                  where ta.teacher_id = auth.uid()
                    and ta.class_id = m.class_id and ta.term_id = m.term_id
                    and ta.is_active = true)))
);
create policy attendance_write on attendance for all to authenticated
using (
  exists (select 1 from meetings m where m.id = attendance.meeting_id
          and guru_can_write_class(m.class_id, m.term_id))
)
with check (
  exists (select 1 from meetings m where m.id = attendance.meeting_id
          and guru_can_write_class(m.class_id, m.term_id))
);

-- ---------- MEETING PHOTOS (ikut hak akses pertemuan induk) ----------
create policy photos_select on meeting_photos for select to authenticated
using (
  exists (select 1 from meetings m where m.id = meeting_photos.meeting_id and (
      is_admin() or is_ketua()
      or m.actual_teacher_id = auth.uid()
      or m.scheduled_teacher_id = auth.uid()
      or exists (select 1 from teacher_assignments ta
                  where ta.teacher_id = auth.uid()
                    and ta.class_id = m.class_id and ta.term_id = m.term_id
                    and ta.is_active = true)))
);
create policy photos_write on meeting_photos for all to authenticated
using (
  exists (select 1 from meetings m where m.id = meeting_photos.meeting_id
          and guru_can_write_class(m.class_id, m.term_id))
)
with check (
  exists (select 1 from meetings m where m.id = meeting_photos.meeting_id
          and guru_can_write_class(m.class_id, m.term_id))
);

-- ---------- EXPORT LOGS : admin & ketua baca; admin tulis ----------
create policy export_read  on export_logs for select to authenticated
  using (is_admin() or is_ketua());
create policy export_admin on export_logs for all to authenticated
  using (is_admin()) with check (is_admin());

-- =============================================================================
-- CATATAN PENTING (baca sebelum produksi)
-- =============================================================================
-- 1. STORAGE: buat bucket PRIVAT bernama 'meeting-documentation' (foto memuat
--    wajah anak -> jangan publik). Akses foto lewat signed URL dari backend.
--    Contoh policy storage (jalankan setelah bucket dibuat) ada di file terpisah.
--
-- 2. MENCEGAH GURU MENGUBAH ROLE-NYA SENDIRI: policy profiles_update_self di atas
--    mengizinkan update kolom apa pun pada baris sendiri, termasuk role_id.
--    Tambahkan trigger untuk mengunci role_id/is_active dari perubahan non-admin,
--    atau pisahkan kolom peran. (Lihat trigger contoh di bawah.)
--
-- 3. meeting_number & baris presensi dibuat otomatis oleh trigger — frontend
--    TIDAK perlu (dan tidak boleh) mengirim meeting_number.
--
-- 4. Google Sheets/Excel hanya OUTPUT. Untuk MVP, mulai dari export .xlsx via
--    Edge Function; integrasi Google Sheets API bisa ditambahkan kemudian.
-- =============================================================================

-- Trigger contoh: kunci role_id & is_active agar hanya admin yg bisa mengubah
create or replace function protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    new.role_id   := old.role_id;
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile on profiles;
create trigger trg_protect_profile before update on profiles
for each row execute function protect_profile_privileges();
