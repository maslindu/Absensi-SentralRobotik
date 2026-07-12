import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Pastikan pemanggil adalah admin aktif (dicek lewat sesi + profiles).
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, roles:role_id(name)')
    .eq('id', user.id)
    .single();
  if (!profile?.is_active || (profile.roles as any)?.name !== 'admin')
    return null;
  return user;
}

// POST /api/admin/users — buat akun guru/ketua (Auth user + profile)
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Hanya admin yang boleh membuat akun' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const { email, password, full_name, phone, role } = body ?? {};
  if (!email || !password || !full_name || !['guru', 'ketua'].includes(role)) {
    return NextResponse.json(
      { error: 'Data tidak lengkap (email, password, nama, role wajib)' },
      { status: 400 }
    );
  }
  if (String(password).length < 6) {
    return NextResponse.json(
      { error: 'Password minimal 6 karakter' },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();

  const { data: roleRow, error: roleErr } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('name', role)
    .single();
  if (roleErr || !roleRow) {
    return NextResponse.json(
      { error: 'Role tidak ditemukan' },
      { status: 500 }
    );
  }

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Gagal membuat akun';
    const duplicate = /already|registered/i.test(msg);
    return NextResponse.json(
      { error: duplicate ? 'Email sudah terdaftar' : msg },
      { status: duplicate ? 409 : 500 }
    );
  }

  const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
    id: created.user.id,
    role_id: roleRow.id,
    full_name,
    phone: phone || null,
  });
  if (profileErr) {
    // bersihkan user auth yang telanjur dibuat agar tidak menggantung
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: 'Gagal membuat profil: ' + profileErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: created.user.id });
}

// PATCH /api/admin/users — reset password user
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Hanya admin yang boleh mengubah akun' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const { user_id, password } = body ?? {};
  if (!user_id || !password || String(password).length < 6) {
    return NextResponse.json(
      { error: 'user_id & password (min. 6 karakter) wajib' },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    password,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
