-- =============================================================================
-- MIGRASI: Hapus role "ketua"
-- =============================================================================
-- Konteks: Fitur ketua (monitoring + rekap read-only) semuanya sudah tercakup
-- di role admin, sehingga role ketua tidak lagi diperlukan.
--
-- Cara pakai: jalankan seluruh isi file ini di Supabase → SQL Editor.
--
-- Catatan:
--  * Diasumsikan BELUM ADA akun ber-role ketua. Blok pengaman di bawah akan
--    menggagalkan migrasi bila ternyata masih ada profil memakai role ketua,
--    agar tidak ada akun yang "menggantung" tanpa role.
--    -> Bila ternyata ada & ingin dijadikan admin, jalankan dulu baris ini:
--         update profiles
--            set role_id = (select id from roles where name = 'admin')
--          where role_id = (select id from roles where name = 'ketua');
--  * Fungsi helper is_ketua() sengaja DIBIARKAN. Setelah role dihapus ia akan
--    selalu mengembalikan false, sehingga policy RLS yang memakainya tetap
--    valid dan aman (cukup jadi tidak pernah memberi akses "ketua").
-- =============================================================================

do $$
declare
  n_profiles int;
begin
  select count(*) into n_profiles
    from profiles p
    join roles r on r.id = p.role_id
   where r.name = 'ketua';

  if n_profiles > 0 then
    raise exception
      'Masih ada % profil ber-role ketua. Ubah dulu role-nya (mis. jadi admin) sebelum menghapus role ketua.',
      n_profiles;
  end if;

  delete from roles where name = 'ketua';
end$$;
