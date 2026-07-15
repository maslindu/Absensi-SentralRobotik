'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { School } from '@/lib/types';
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

interface FormState {
  id?: string;
  name: string;
  address: string;
  contact_person: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  name: '',
  address: '',
  contact_person: '',
  is_active: true,
};

export default function SchoolsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<School | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('name');
    if (error) toast('Gagal memuat data: ' + error.message, 'error');
    setSchools((data as School[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = schools.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      contact_person: form.contact_person.trim() || null,
      is_active: form.is_active,
    };
    const { error } = form.id
      ? await supabase.from('schools').update(payload).eq('id', form.id)
      : await supabase.from('schools').insert(payload);
    setSaving(false);
    if (error) {
      toast(
        error.code === '23505'
          ? 'Nama sekolah sudah terdaftar'
          : 'Gagal menyimpan: ' + error.message,
        'error'
      );
      return;
    }
    toast('Sekolah tersimpan');
    setModalOpen(false);
    load();
  }

  async function toggleActive(s: School) {
    const { error } = await supabase
      .from('schools')
      .update({ is_active: !s.is_active })
      .eq('id', s.id);
    if (error) {
      toast('Gagal mengubah status', 'error');
      return;
    }
    toast(s.is_active ? 'Sekolah dinonaktifkan' : 'Sekolah diaktifkan');
    setToDeactivate(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Sekolah"
        subtitle="Sekolah mitra tempat mengajar"
        action={
          <button
            className={btnPrimary}
            onClick={() => {
              setForm(emptyForm);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Tambah
          </button>
        }
      />

      <input
        className={`${inputCls} mb-4 max-w-sm`}
        placeholder="Cari nama sekolah…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            search
              ? 'Tidak ada sekolah yang cocok'
              : 'Belum ada sekolah'
          }
          hint={search ? undefined : 'Tambahkan sekolah pertama.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Alamat</th>
                <th className="px-4 py-3">Kontak</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.address || '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.contact_person || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={s.is_active} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className={btnSmall}
                        onClick={() => {
                          setForm({
                            id: s.id,
                            name: s.name,
                            address: s.address ?? '',
                            contact_person: s.contact_person ?? '',
                            is_active: s.is_active,
                          });
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className={btnSmall}
                        onClick={() =>
                          s.is_active ? setToDeactivate(s) : toggleActive(s)
                        }
                      >
                        {s.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={form.id ? 'Edit Sekolah' : 'Tambah Sekolah'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Nama Sekolah" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="SMP N 1 Surakarta"
              required
            />
          </Field>
          <Field label="Alamat">
            <input
              className={inputCls}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Narahubung">
            <input
              className={inputCls}
              value={form.contact_person}
              onChange={(e) =>
                setForm({ ...form, contact_person: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setModalOpen(false)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Simpan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDeactivate}
        title="Nonaktifkan sekolah?"
        message={`"${toDeactivate?.name}" akan disembunyikan dari pilihan aktif, tetapi datanya tetap tersimpan.`}
        confirmLabel="Nonaktifkan"
        danger
        onConfirm={() => toDeactivate && toggleActive(toDeactivate)}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
