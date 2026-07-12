'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { Class, School } from '@/lib/types';
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
  school_id: string;
  name: string;
  grade_level: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  school_id: '',
  name: '',
  grade_level: '',
  is_active: true,
};

export default function ClassesPage() {
  const supabase = createClient();
  const toast = useToast();
  const [classes, setClasses] = useState<Class[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolFilter, setSchoolFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<Class | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cls, sch] = await Promise.all([
      supabase
        .from('classes')
        .select('*, schools:school_id(id, name)')
        .order('name'),
      supabase.from('schools').select('*').eq('is_active', true).order('name'),
    ]);
    if (cls.error) toast('Gagal memuat data: ' + cls.error.message, 'error');
    setClasses((cls.data as Class[]) ?? []);
    setSchools((sch.data as School[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = schoolFilter
    ? classes.filter((c) => c.school_id === schoolFilter)
    : classes;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      school_id: form.school_id,
      name: form.name.trim(),
      grade_level: form.grade_level.trim() || null,
      is_active: form.is_active,
    };
    const { error } = form.id
      ? await supabase.from('classes').update(payload).eq('id', form.id)
      : await supabase.from('classes').insert(payload);
    setSaving(false);
    if (error) {
      toast(
        error.code === '23505'
          ? 'Nama kelas sudah ada di sekolah ini'
          : 'Gagal menyimpan: ' + error.message,
        'error'
      );
      return;
    }
    toast('Kelas tersimpan');
    setModalOpen(false);
    load();
  }

  async function toggleActive(c: Class) {
    const { error } = await supabase
      .from('classes')
      .update({ is_active: !c.is_active })
      .eq('id', c.id);
    if (error) {
      toast('Gagal mengubah status', 'error');
      return;
    }
    toast(c.is_active ? 'Kelas dinonaktifkan' : 'Kelas diaktifkan');
    setToDeactivate(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Kelas"
        subtitle="Kelas per sekolah (nama bebas per sekolah)"
        action={
          <button
            className={btnPrimary}
            onClick={() => {
              setForm({ ...emptyForm, school_id: schools[0]?.id ?? '' });
              setModalOpen(true);
            }}
          >
            + Tambah
          </button>
        }
      />

      <select
        className={`${inputCls} mb-4 max-w-sm`}
        value={schoolFilter}
        onChange={(e) => setSchoolFilter(e.target.value)}
      >
        <option value="">Semua sekolah</option>
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Belum ada kelas"
          hint="Tambahkan kelas untuk sekolah yang sudah terdaftar."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Sekolah</th>
                <th className="px-4 py-3">Nama Kelas</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-600">
                    {c.schools?.name}
                  </td>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {c.grade_level || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={c.is_active} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className={btnSmall}
                        onClick={() => {
                          setForm({
                            id: c.id,
                            school_id: c.school_id,
                            name: c.name,
                            grade_level: c.grade_level ?? '',
                            is_active: c.is_active,
                          });
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className={btnSmall}
                        onClick={() =>
                          c.is_active ? setToDeactivate(c) : toggleActive(c)
                        }
                      >
                        {c.is_active ? 'Nonaktifkan' : 'Aktifkan'}
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
        title={form.id ? 'Edit Kelas' : 'Tambah Kelas'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Sekolah" required>
            <select
              className={inputCls}
              value={form.school_id}
              onChange={(e) => setForm({ ...form, school_id: e.target.value })}
              required
            >
              <option value="">— pilih sekolah —</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nama Kelas" required hint="Contoh: 7, 7A, 8B">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Grade / Tingkat">
            <input
              className={inputCls}
              value={form.grade_level}
              onChange={(e) =>
                setForm({ ...form, grade_level: e.target.value })
              }
              placeholder="opsional"
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
        title="Nonaktifkan kelas?"
        message={`Kelas "${toDeactivate?.name}" akan disembunyikan dari pilihan aktif, tetapi datanya tetap tersimpan.`}
        confirmLabel="Nonaktifkan"
        danger
        onConfirm={() => toDeactivate && toggleActive(toDeactivate)}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
