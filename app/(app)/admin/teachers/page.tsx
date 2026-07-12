'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { Profile } from '@/lib/types';
import {
  ActiveBadge,
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Spinner,
  btnPrimary,
  btnSecondary,
  btnSmall,
  inputCls,
} from '@/components/ui';

interface AddForm {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  role: 'guru' | 'ketua';
}

const emptyAdd: AddForm = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  role: 'guru',
};

export default function TeachersPage() {
  const supabase = createClient();
  const toast = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyAdd);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '' });
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, roles:role_id(id, name)')
      .order('full_name');
    if (error) toast('Gagal memuat data: ' + error.message, 'error');
    // tampilkan guru & ketua (akun admin dikelola langsung di Supabase)
    setUsers(
      ((data as Profile[]) ?? []).filter(
        (p) => p.roles?.name === 'guru' || p.roles?.name === 'ketua'
      )
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast(json.error ?? 'Gagal membuat akun', 'error');
      return;
    }
    toast('Akun berhasil dibuat');
    setAddOpen(false);
    setAddForm(emptyAdd);
    load();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editForm.full_name.trim(),
        phone: editForm.phone.trim() || null,
      })
      .eq('id', editTarget.id);
    setSaving(false);
    if (error) {
      toast('Gagal menyimpan: ' + error.message, 'error');
      return;
    }
    toast('Profil diperbarui');
    setEditTarget(null);
    load();
  }

  async function doResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: resetTarget.id,
        password: resetPassword,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast(json.error ?? 'Gagal reset password', 'error');
      return;
    }
    toast('Password berhasil direset');
    setResetTarget(null);
    setResetPassword('');
  }

  async function toggleActive(p: Profile) {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !p.is_active })
      .eq('id', p.id);
    if (error) {
      toast('Gagal mengubah status', 'error');
      return;
    }
    toast(p.is_active ? 'Akun dinonaktifkan' : 'Akun diaktifkan');
    setToDeactivate(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Guru & Ketua"
        subtitle="Kelola akun pengajar dan ketua komunitas"
        action={
          <button
            className={btnPrimary}
            onClick={() => {
              setAddForm(emptyAdd);
              setAddOpen(true);
            }}
          >
            + Tambah Akun
          </button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <EmptyState
          title="Belum ada akun guru/ketua"
          hint="Tambahkan akun pertama untuk pengajar."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">No. HP</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((p) => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 capitalize text-gray-600">
                    {p.roles?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.phone || '-'}</td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={p.is_active} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className={btnSmall}
                        onClick={() => {
                          setEditTarget(p);
                          setEditForm({
                            full_name: p.full_name,
                            phone: p.phone ?? '',
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className={btnSmall}
                        onClick={() => {
                          setResetTarget(p);
                          setResetPassword('');
                        }}
                      >
                        Reset Password
                      </button>
                      <button
                        className={btnSmall}
                        onClick={() =>
                          p.is_active ? setToDeactivate(p) : toggleActive(p)
                        }
                      >
                        {p.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tambah akun */}
      <Modal
        open={addOpen}
        title="Tambah Akun"
        onClose={() => setAddOpen(false)}
      >
        <form onSubmit={createUser} className="space-y-4">
          <Field label="Nama Lengkap" required>
            <input
              className={inputCls}
              value={addForm.full_name}
              onChange={(e) =>
                setAddForm({ ...addForm, full_name: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              className={inputCls}
              value={addForm.email}
              onChange={(e) =>
                setAddForm({ ...addForm, email: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Password Awal" required hint="Minimal 6 karakter">
            <input
              type="text"
              className={inputCls}
              value={addForm.password}
              onChange={(e) =>
                setAddForm({ ...addForm, password: e.target.value })
              }
              minLength={6}
              required
            />
          </Field>
          <Field label="No. HP">
            <input
              className={inputCls}
              value={addForm.phone}
              onChange={(e) =>
                setAddForm({ ...addForm, phone: e.target.value })
              }
            />
          </Field>
          <Field label="Role" required>
            <select
              className={inputCls}
              value={addForm.role}
              onChange={(e) =>
                setAddForm({
                  ...addForm,
                  role: e.target.value as 'guru' | 'ketua',
                })
              }
            >
              <option value="guru">Guru</option>
              <option value="ketua">Ketua</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setAddOpen(false)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Buat Akun
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit profil */}
      <Modal
        open={!!editTarget}
        title="Edit Profil"
        onClose={() => setEditTarget(null)}
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Nama Lengkap" required>
            <input
              className={inputCls}
              value={editForm.full_name}
              onChange={(e) =>
                setEditForm({ ...editForm, full_name: e.target.value })
              }
              required
            />
          </Field>
          <Field label="No. HP">
            <input
              className={inputCls}
              value={editForm.phone}
              onChange={(e) =>
                setEditForm({ ...editForm, phone: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setEditTarget(null)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!resetTarget}
        title={`Reset Password — ${resetTarget?.full_name ?? ''}`}
        onClose={() => setResetTarget(null)}
      >
        <form onSubmit={doResetPassword} className="space-y-4">
          <Field label="Password Baru" required hint="Minimal 6 karakter">
            <input
              type="text"
              className={inputCls}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={6}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setResetTarget(null)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Reset
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDeactivate}
        title="Nonaktifkan akun?"
        message={`Akun "${toDeactivate?.full_name}" tidak akan bisa mengakses sistem, tetapi datanya tetap tersimpan.`}
        confirmLabel="Nonaktifkan"
        danger
        onConfirm={() => toDeactivate && toggleActive(toDeactivate)}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
