'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { AcademicTerm } from '@/lib/types';
import { formatDateShort } from '@/lib/format';
import {
  ActiveBadge,
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
  year_label: string;
  semester: 'ganjil' | 'genap';
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  year_label: '',
  semester: 'ganjil',
  start_date: '',
  end_date: '',
  is_active: false,
};

export default function TermsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('academic_terms')
      .select('*')
      .order('year_label', { ascending: false })
      .order('semester');
    if (error) toast('Gagal memuat data: ' + error.message, 'error');
    setTerms((data as AcademicTerm[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(t: AcademicTerm) {
    setForm({
      id: t.id,
      year_label: t.year_label,
      semester: t.semester,
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      is_active: t.is_active,
    });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.end_date && form.start_date && form.end_date < form.start_date) {
      toast('Tanggal selesai harus ≥ tanggal mulai', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      year_label: form.year_label.trim(),
      semester: form.semester,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
    };
    const { error } = form.id
      ? await supabase.from('academic_terms').update(payload).eq('id', form.id)
      : await supabase.from('academic_terms').insert(payload);
    setSaving(false);
    if (error) {
      toast(
        error.code === '23505'
          ? 'Kombinasi tahun ajaran & semester sudah ada'
          : 'Gagal menyimpan: ' + error.message,
        'error'
      );
      return;
    }
    toast('Tahun ajaran tersimpan');
    setModalOpen(false);
    load();
  }

  async function setActive(t: AcademicTerm) {
    // nonaktifkan term lain, lalu aktifkan yang dipilih
    const { error: e1 } = await supabase
      .from('academic_terms')
      .update({ is_active: false })
      .neq('id', t.id);
    const { error: e2 } = await supabase
      .from('academic_terms')
      .update({ is_active: true })
      .eq('id', t.id);
    if (e1 || e2) {
      toast('Gagal mengubah term aktif', 'error');
      return;
    }
    toast('Term aktif diperbarui');
    load();
  }

  return (
    <div>
      <PageHeader
        title="Tahun Ajaran"
        subtitle="Kelola periode semester & tentukan term aktif"
        action={
          <button className={btnPrimary} onClick={openAdd}>
            <Plus className="h-4 w-4" /> Tambah
          </button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : terms.length === 0 ? (
        <EmptyState
          title="Belum ada tahun ajaran"
          hint="Tambahkan tahun ajaran pertama, mis. 2026/2027 Ganjil."
          action={
            <button className={btnPrimary} onClick={openAdd}>
              <Plus className="h-4 w-4" /> Tambah Tahun Ajaran
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Tahun Ajaran</th>
                <th className="px-4 py-3">Semester</th>
                <th className="px-4 py-3">Mulai</th>
                <th className="px-4 py-3">Selesai</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">{t.year_label}</td>
                  <td className="px-4 py-3 capitalize">{t.semester}</td>
                  <td className="px-4 py-3">{formatDateShort(t.start_date)}</td>
                  <td className="px-4 py-3">{formatDateShort(t.end_date)}</td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={t.is_active} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {!t.is_active && (
                        <button
                          className={btnSmall}
                          onClick={() => setActive(t)}
                        >
                          Set Aktif
                        </button>
                      )}
                      <button className={btnSmall} onClick={() => openEdit(t)}>
                        Edit
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
        title={form.id ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Tahun Ajaran" required hint="Contoh: 2026/2027">
            <input
              className={inputCls}
              value={form.year_label}
              onChange={(e) =>
                setForm({ ...form, year_label: e.target.value })
              }
              placeholder="2026/2027"
              required
            />
          </Field>
          <Field label="Semester" required>
            <select
              className={inputCls}
              value={form.semester}
              onChange={(e) =>
                setForm({
                  ...form,
                  semester: e.target.value as 'ganjil' | 'genap',
                })
              }
            >
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal Mulai">
              <input
                type="date"
                className={inputCls}
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
              />
            </Field>
            <Field label="Tanggal Selesai">
              <input
                type="date"
                className={inputCls}
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
            />
            Jadikan term aktif
          </label>
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
    </div>
  );
}
