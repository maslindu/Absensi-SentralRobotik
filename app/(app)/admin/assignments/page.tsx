'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type {
  AcademicTerm,
  Class,
  Profile,
  School,
  TeacherAssignment,
} from '@/lib/types';
import { termLabel } from '@/lib/format';
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

export default function AssignmentsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [form, setForm] = useState({
    teacher_id: '',
    school_id: '',
    class_id: '',
    term_id: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [asg, prof, sch, cls, tm] = await Promise.all([
      supabase
        .from('teacher_assignments')
        .select(
          '*, profiles:teacher_id(id, full_name), schools:school_id(id, name), classes:class_id(id, name), academic_terms:term_id(id, year_label, semester, is_active)'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('*, roles:role_id(name)')
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('schools').select('*').eq('is_active', true).order('name'),
      supabase.from('classes').select('*').eq('is_active', true).order('name'),
      supabase
        .from('academic_terms')
        .select('*')
        .order('year_label', { ascending: false }),
    ]);
    if (asg.error) toast('Gagal memuat data: ' + asg.error.message, 'error');
    setAssignments((asg.data as TeacherAssignment[]) ?? []);
    setTeachers(
      ((prof.data as Profile[]) ?? []).filter((p) => p.roles?.name === 'guru')
    );
    setSchools((sch.data as School[]) ?? []);
    setClasses((cls.data as Class[]) ?? []);
    setTerms((tm.data as AcademicTerm[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = filterTerm
    ? assignments.filter((a) => a.term_id === filterTerm)
    : assignments;

  const classesOfSchool = classes.filter(
    (c) => c.school_id === form.school_id
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('teacher_assignments').insert({
      teacher_id: form.teacher_id,
      school_id: form.school_id,
      class_id: form.class_id,
      term_id: form.term_id,
    });
    setSaving(false);
    if (error) {
      toast(
        error.code === '23505'
          ? 'Guru sudah ditugaskan di kelas & semester ini'
          : 'Gagal menyimpan: ' + error.message,
        'error'
      );
      return;
    }
    toast('Penugasan tersimpan');
    setModalOpen(false);
    load();
  }

  async function toggleActive(a: TeacherAssignment) {
    const { error } = await supabase
      .from('teacher_assignments')
      .update({ is_active: !a.is_active })
      .eq('id', a.id);
    if (error) {
      toast('Gagal mengubah status', 'error');
      return;
    }
    toast(a.is_active ? 'Penugasan dinonaktifkan' : 'Penugasan diaktifkan');
    load();
  }

  return (
    <div>
      <PageHeader
        title="Penugasan Guru"
        subtitle="Guru utama per kelas per semester — menentukan kelas yang boleh diisi guru"
        action={
          <button
            className={btnPrimary}
            onClick={() => {
              const activeTerm = terms.find((t) => t.is_active);
              setForm({
                teacher_id: '',
                school_id: '',
                class_id: '',
                term_id: activeTerm?.id ?? '',
              });
              setModalOpen(true);
            }}
          >
            + Tambah
          </button>
        }
      />

      <select
        className={`${inputCls} mb-4 max-w-sm`}
        value={filterTerm}
        onChange={(e) => setFilterTerm(e.target.value)}
      >
        <option value="">Semua term</option>
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            {termLabel(t)}
          </option>
        ))}
      </select>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Belum ada penugasan"
          hint="Tetapkan guru utama untuk tiap kelas per semester."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Guru</th>
                <th className="px-4 py-3">Sekolah</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">
                    {a.profiles?.full_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.schools?.name}
                  </td>
                  <td className="px-4 py-3">{a.classes?.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.academic_terms ? termLabel(a.academic_terms) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={a.is_active} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className={btnSmall}
                      onClick={() => toggleActive(a)}
                    >
                      {a.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Tambah Penugasan"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Guru" required>
            <select
              className={inputCls}
              value={form.teacher_id}
              onChange={(e) =>
                setForm({ ...form, teacher_id: e.target.value })
              }
              required
            >
              <option value="">— pilih guru —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sekolah" required>
            <select
              className={inputCls}
              value={form.school_id}
              onChange={(e) =>
                setForm({ ...form, school_id: e.target.value, class_id: '' })
              }
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
          <Field label="Kelas" required>
            <select
              className={inputCls}
              value={form.class_id}
              onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              required
              disabled={!form.school_id}
            >
              <option value="">— pilih kelas —</option>
              {classesOfSchool.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Term" required>
            <select
              className={inputCls}
              value={form.term_id}
              onChange={(e) => setForm({ ...form, term_id: e.target.value })}
              required
            >
              <option value="">— pilih term —</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {termLabel(t)}
                  {t.is_active ? ' (aktif)' : ''}
                </option>
              ))}
            </select>
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
    </div>
  );
}
