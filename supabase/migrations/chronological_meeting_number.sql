-- =============================================================================
-- MIGRASI: nomor pertemuan mengikuti TANGGAL, bukan urutan input
--
-- Masalah: guru yang lupa mengisi laporan minggu lalu lalu mengisinya hari ini
-- mendapat nomor max+1, sehingga laporan tanggal lampau justru bernomor lebih
-- besar daripada laporan yang tanggalnya lebih baru.
--
-- Solusi: setelah setiap insert / ubah tanggal / hapus pertemuan, seluruh
-- pertemuan pada (kelas, term) dinomori ulang 1..n urut meeting_date. Jadi:
--   * isi laporan minggu lalu hari ini  -> jadi pertemuan ke-1
--   * lalu isi laporan hari ini         -> jadi pertemuan ke-2
--   * dua minggu terlewat, diisi hari ini -> 1, 2, lalu hari ini jadi 3
--
-- Jalankan di SQL Editor Supabase (idempoten, aman diulang).
-- =============================================================================

-- Penomoran ulang dipanggil dari trigger. SECURITY DEFINER agar guru tetap bisa
-- menyimpan laporan meski penomoran ulang menyentuh baris pertemuan lain
-- (mis. milik guru pengganti) yang tak tercakup policy update miliknya.
create or replace function renumber_class_meetings()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_class uuid;
  v_term  uuid;
begin
  if tg_op = 'DELETE' then
    v_class := old.class_id;
    v_term  := old.term_id;
  else
    v_class := new.class_id;
    v_term  := new.term_id;
  end if;

  -- kunci per (kelas, term): dua guru submit bersamaan tidak saling menimpa
  perform pg_advisory_xact_lock(hashtext(v_class::text || ':' || v_term::text));

  -- keluar lebih awal bila penomoran sudah benar (hindari update sia-sia)
  if not exists (
    select 1 from (
      select meeting_number,
             row_number() over (order by meeting_date, created_at, id) as rn
        from meetings
       where class_id = v_class and term_id = v_term
    ) x
    where x.meeting_number is distinct from x.rn::integer
  ) then
    return null;
  end if;

  -- Dua langkah: nomor sementara dibuat NEGATIF supaya tidak menabrak
  -- unique (class_id, term_id, meeting_number) saat nomor bertukar posisi.
  update meetings m
     set meeting_number = -x.rn
    from (
      select id, row_number() over (order by meeting_date, created_at, id) as rn
        from meetings
       where class_id = v_class and term_id = v_term
    ) x
   where m.id = x.id
     and m.meeting_number is distinct from x.rn::integer;

  update meetings
     set meeting_number = -meeting_number
   where class_id = v_class
     and term_id = v_term
     and meeting_number < 0;

  return null;
end;
$$;

-- Insert & hapus: selalu nomori ulang.
-- Update: hanya bila meeting_date berubah — trigger ini sendiri cuma mengubah
-- meeting_number, jadi tidak memicu dirinya sendiri (tidak ada rekursi).
drop trigger if exists trg_renumber_meetings_ins on meetings;
create trigger trg_renumber_meetings_ins after insert on meetings
for each row execute function renumber_class_meetings();

drop trigger if exists trg_renumber_meetings_upd on meetings;
create trigger trg_renumber_meetings_upd after update of meeting_date on meetings
for each row execute function renumber_class_meetings();

drop trigger if exists trg_renumber_meetings_del on meetings;
create trigger trg_renumber_meetings_del after delete on meetings
for each row execute function renumber_class_meetings();

-- ---------------------------------------------------------------------------
-- Seed presensi: jangan pakai start_date sebagai filter.
-- Siswa sering baru didaftarkan SETELAH pertemuannya berlangsung, sehingga
-- laporan backdate jadi kosong siswanya. Yang menentukan hanya apakah siswa
-- sudah keluar dari kelas (end_date) pada tanggal pertemuan itu.
-- ---------------------------------------------------------------------------
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
     and (e.end_date is null or e.end_date >= new.meeting_date)
     and s.status = 'aktif'
  on conflict (meeting_id, student_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: rapikan penomoran data yang sudah ada.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select distinct class_id, term_id from meetings loop
    update meetings m
       set meeting_number = -x.rn
      from (
        select id, row_number() over (order by meeting_date, created_at, id) as rn
          from meetings
         where class_id = r.class_id and term_id = r.term_id
      ) x
     where m.id = x.id
       and m.meeting_number is distinct from x.rn::integer;

    update meetings
       set meeting_number = -meeting_number
     where class_id = r.class_id
       and term_id = r.term_id
       and meeting_number < 0;
  end loop;
end$$;
