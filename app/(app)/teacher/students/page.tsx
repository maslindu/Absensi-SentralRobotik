'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type {
  AcademicTerm,
  Enrollment,
  Student,
  TeacherAssignment,
} from '@/lib/types';
import { formatDateShort, termLabel, todayISO } from '@/lib/format';
import {
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

export default function TeacherStudentsPage() {
  const supabase = createClient();
  const toast = useToast();

  const [term, setTerm] = useState<AcademicTerm | null>(null);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [classId, setClassId] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'baru' | 'sudah-ada'>('baru');
  const [newName, setNewName] = useState('');
  const [newNis, setNewNis] = useState('');
  const [existingStudents, setExistingStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const [toEnd, setToEnd] = useState<Enrollment | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: termData } = await supabase
        .from('academic_terms')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      const activeTerm = termData as AcademicTerm | null;
      setTerm(activeTerm);

      if (activeTerm) {
        const { data: asg } = await supabase
          .from('teacher_assignments')
          .select(
            '*, schools:school_id(id, name), classes:class_id(id, name)'
          )
          .eq('teacher_id', user.id)
          .eq('term_id', activeTerm.id)
          .eq('is_active', true);
        const list = (asg as TeacherAssignment[]) ?? [];
        setAssignments(list);
        if (list.length > 0) setClassId(list[0].class_id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRoster = useCallback(async () => {
    if (!classId || !term) {
      setEnrollments([]);
      return;
    }
    setListLoading(true);
    const { data, error } = await supabase
      .from('enrollments')
      .select('*, students:student_id(id, full_name, nis, status)')
      .eq('class_id', classId)
      .eq('term_id', term.id)
      .order('start_date');
    if (error) toast('Gagal memuat roster: ' + error.message, 'error');
    setEnrollments((data as Enrollment[]) ?? []);
    setListLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  async function openAdd() {
    setAddMode('baru');
    setNewName('');
    setNewNis('');
    setSelectedStudentId('');
    setStartDate(todayISO());
    setAddOpen(true);
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('status', 'aktif')
      .order('full_name');
    const enrolled = new Set(enrollments.map((e) => e.student_id));
    setExistingStudents(
      ((data as Student[]) ?? []).filter((s) => !enrolled.has(s.id))
    );
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!term) return;
    setSaving(true);
    try {
      let studentId: string;
      if (addMode === 'baru') {
        const { data: student, error } = await supabase
          .from('students')
          .insert({ full_name: newName.trim(), nis: newNis.trim() || null })
          .select()
          .single();
        if (error || !student) {
          toast('Gagal membuat siswa: ' + (error?.message ?? ''), 'error');
          return;
        }
        studentId = student.id;
      } else {
        studentId = selectedStudentId;
      }

      const { error: enrollErr } = await supabase.from('enrollments').insert({
        student_id: studentId,
        class_id: classId,
        term_id: term.id,
        start_date: startDate,
      });
      if (enrollErr) {
        toast(
          enrollErr.code === '23505'
            ? 'Siswa sudah terdaftar di kelas ini'
            : enrollErr.message.includes('row-level security')
              ? 'Kamu tidak ditugaskan di kelas ini'
              : 'Gagal enrollment: ' + enrollErr.message,
          'error'
        );
        return;
      }
      toast('Siswa ditambahkan ke kelas');
      setAddOpen(false);
      loadRoster();
    } finally {
      setSaving(false);
    }
  }

  async function endEnrollment(en: Enrollment) {
    const { error } = await supabase
      .from('enrollments')
      .update({ end_date: todayISO(), is_active: false })
      .eq('id', en.id);
    setToEnd(null);
    if (error) {
      toast('Gagal mengeluarkan siswa: ' + error.message, 'error');
      return;
    }
    toast('Siswa dikeluarkan — presensi lama tetap tersimpan');
    loadRoster();
  }

  if (loading) return <LoadingState />;

  if (!term) {
    return (
      <div>
        <PageHeader title="Siswa" />
        <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-6 text-sm text-yellow-800">
          Belum ada tahun ajaran aktif. Hubungi admin.
        </p>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div>
        <PageHeader title="Siswa" />
        <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-6 text-sm text-yellow-800">
          Kamu belum ditugaskan di kelas mana pun untuk term{' '}
          {termLabel(term)}.
        </p>
      </div>
    );
  }

  const activeRoster = enrollments.filter((e) => !e.end_date);
  const pastRoster = enrollments.filter((e) => e.end_date);

  return (
    <div>
      <PageHeader
        title="Roster Siswa"
        subtitle={`Kelola siswa kelas yang kamu ampu — ${termLabel(term)}`}
        action={
          <button className={btnPrimary} onClick={openAdd}>
            + Tambah Siswa
          </button>
        }
      />

      <select
        className={`${inputCls} mb-4 max-w-sm`}
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
      >
        {assignments.map((a) => (
          <option key={a.id} value={a.class_id}>
            {a.schools?.name} — Kelas {a.classes?.name}
          </option>
        ))}
      </select>

      {listLoading ? (
        <LoadingState />
      ) : enrollments.length === 0 ? (
        <EmptyState
          title="Belum ada siswa di kelas ini"
          hint="Tambahkan siswa — bisa juga langsung dari layar presensi saat pertemuan."
          action={
            <button className={btnPrimary} onClick={openAdd}>
              + Tambah Siswa
            </button>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">NIS</th>
                  <th className="px-4 py-3">Masuk</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {activeRoster.map((en) => (
                  <tr key={en.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">
                      {en.students?.full_name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {en.students?.nis || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateShort(en.start_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className={btnSmall}
                        onClick={() => setToEnd(en)}
                      >
                        ➖ Keluarkan
                      </button>
                    </td>
                  </tr>
                ))}
                {activeRoster.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-slate-400"
                    >
                      Tidak ada siswa aktif di kelas ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pastRoster.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-500">
                Sudah keluar
              </h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white opacity-70">
                <table className="w-full min-w-[520px] text-sm">
                  <tbody>
                    {pastRoster.map((en) => (
                      <tr key={en.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          {en.students?.full_name}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          keluar {formatDateShort(en.end_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal tambah siswa */}
      <Modal
        open={addOpen}
        title="Tambah Siswa ke Kelas"
        onClose={() => setAddOpen(false)}
      >
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              addMode === 'baru'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 shadow-sm text-slate-600'
            }`}
            onClick={() => setAddMode('baru')}
          >
            Siswa Baru
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              addMode === 'sudah-ada'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 shadow-sm text-slate-600'
            }`}
            onClick={() => setAddMode('sudah-ada')}
          >
            Sudah Terdaftar
          </button>
        </div>

        <form onSubmit={addStudent} className="space-y-4">
          {addMode === 'baru' ? (
            <>
              <Field label="Nama Lengkap" required>
                <input
                  className={inputCls}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </Field>
              <Field label="NIS">
                <input
                  className={inputCls}
                  value={newNis}
                  onChange={(e) => setNewNis(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <Field label="Pilih Siswa" required>
              <select
                className={inputCls}
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
              >
                <option value="">— pilih siswa —</option>
                {existingStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.nis ? ` (${s.nis})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Tanggal Masuk" required>
            <input
              type="date"
              className={inputCls}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setAddOpen(false)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Tambahkan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toEnd}
        title="Keluarkan siswa dari kelas?"
        message={`${toEnd?.students?.full_name} tidak akan muncul di pertemuan berikutnya. Presensi yang sudah tercatat tetap utuh.`}
        confirmLabel="Keluarkan"
        danger
        onConfirm={() => toEnd && endEnrollment(toEnd)}
        onCancel={() => setToEnd(null)}
      />
    </div>
  );
}
