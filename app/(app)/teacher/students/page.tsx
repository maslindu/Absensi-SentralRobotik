'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Upload,
  UserMinus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type {
  AcademicTerm,
  Enrollment,
  Student,
  TeacherAssignment,
} from '@/lib/types';
import { formatDateShort, termLabel, todayISO } from '@/lib/format';
import { downloadStudentTemplate, parseStudentSheet } from '@/lib/excel';
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
  const [schoolFilter, setSchoolFilter] = useState('');
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

  // import excel
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

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

  function openImport() {
    setImportResult(null);
    setImportOpen(true);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!classId || !term) {
      toast('Pilih kelas terlebih dahulu', 'error');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const { rows: parsed, skipped } = await parseStudentSheet(file);
      if (parsed.length === 0) {
        setImportResult({
          added: 0,
          skipped,
          errors: ['File tidak berisi nama siswa. Pastikan kolom A = Nama.'],
        });
        return;
      }

      // buat identitas siswa (batch) lalu enroll ke kelas yang sedang dipilih
      const { data: inserted, error: stErr } = await supabase
        .from('students')
        .insert(parsed)
        .select('id');
      if (stErr || !inserted) {
        setImportResult({
          added: 0,
          skipped,
          errors: ['Gagal membuat siswa: ' + (stErr?.message ?? '')],
        });
        return;
      }

      const enrollRows = (inserted as { id: string }[]).map((s) => ({
        student_id: s.id,
        class_id: classId,
        term_id: term.id,
        start_date: todayISO(),
      }));
      const { error: enErr } = await supabase
        .from('enrollments')
        .insert(enrollRows);

      const errors: string[] = [];
      if (enErr) {
        errors.push(
          enErr.message.includes('row-level security')
            ? 'Kamu tidak ditugaskan di kelas ini — siswa dibuat tetapi gagal didaftarkan.'
            : 'Siswa dibuat, tetapi sebagian gagal didaftarkan: ' +
                enErr.message
        );
      }

      setImportResult({ added: inserted.length, skipped, errors });
      loadRoster();
    } catch (err) {
      setImportResult({
        added: 0,
        skipped: 0,
        errors: ['Gagal membaca file Excel: ' + (err as Error).message],
      });
    } finally {
      setImporting(false);
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
  const assignedSchools = assignments.reduce<TeacherAssignment[]>(
    (result, assignment) =>
      result.some((item) => item.school_id === assignment.school_id)
        ? result
        : [...result, assignment],
    []
  );
  const classesOfSchool = assignments.filter(
    (assignment) => assignment.school_id === schoolFilter
  );

  return (
    <div>
      <PageHeader
        title="Roster Siswa"
        subtitle={`Kelola siswa kelas yang kamu ampu — ${termLabel(term)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary} onClick={downloadStudentTemplate}>
              <Download className="h-4 w-4" /> Template
            </button>
            <button
              className={btnSecondary}
              onClick={openImport}
              disabled={!classId}
            >
              <FileSpreadsheet className="h-4 w-4" /> Import Excel
            </button>
            <button
              className={btnPrimary}
              onClick={openAdd}
              disabled={!classId}
            >
              <Plus className="h-4 w-4" /> Tambah Siswa
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
      <select
        aria-label="Pilih sekolah"
        className={inputCls}
        value={schoolFilter}
        onChange={(e) => {
          setSchoolFilter(e.target.value);
          setClassId('');
        }}
      >
        <option value="">Pilih sekolah</option>
        {assignedSchools.map((assignment) => (
          <option key={assignment.school_id} value={assignment.school_id}>
            {assignment.schools?.name}
          </option>
        ))}
      </select>
      <select
        className={`${inputCls} mb-4 max-w-sm`}
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
        disabled={!schoolFilter}
      >
        <option value="">Pilih kelas</option>
        {classesOfSchool.map((a) => (
          <option key={a.id} value={a.class_id}>
            {a.schools?.name} — Kelas {a.classes?.name}
          </option>
        ))}
      </select>
      </div>

      {listLoading ? (
        <LoadingState />
      ) : !schoolFilter || !classId ? (
        <EmptyState
          title="Pilih sekolah dan kelas"
          hint="Roster siswa akan dimuat setelah kamu memilih kelas."
        />
      ) : enrollments.length === 0 ? (
        <EmptyState
          title="Belum ada siswa di kelas ini"
          hint="Tambahkan siswa — bisa juga langsung dari layar presensi saat pertemuan."
          action={
            <button className={btnPrimary} onClick={openAdd}>
              <Plus className="h-4 w-4" /> Tambah Siswa
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
                        <UserMinus className="h-3.5 w-3.5" /> Keluarkan
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
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-600'
            }`}
            onClick={() => setAddMode('baru')}
          >
            Siswa Baru
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              addMode === 'sudah-ada'
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-600'
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

      {/* Import Excel */}
      <Modal
        open={importOpen}
        title="Import Siswa dari Excel"
        onClose={() => setImportOpen(false)}
        wide
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50 px-4 py-3 text-xs text-brand-800 ring-1 ring-brand-100">
            <p className="font-semibold">Format file (.xlsx / .xls):</p>
            <p className="mt-1">
              Kolom <b>A = Nama Lengkap</b> (wajib), kolom <b>B = NIS</b>{' '}
              (opsional). Baris judul otomatis dilewati.
            </p>
            <p className="mt-1">
              Semua siswa akan didaftarkan ke kelas yang sedang kamu pilih:{' '}
              <b>
                {assignments.find((a) => a.class_id === classId)?.schools
                  ?.name}{' '}
                — Kelas{' '}
                {assignments.find((a) => a.class_id === classId)?.classes?.name}
              </b>
              .
            </p>
            <button
              type="button"
              onClick={downloadStudentTemplate}
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              <Download className="h-3.5 w-3.5" /> Unduh template contoh
            </button>
          </div>

          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={handleImportFile}
          />
          <button
            type="button"
            disabled={importing || !classId}
            onClick={() => importFileRef.current?.click()}
            className={`${btnPrimary} w-full`}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? 'Mengimpor…' : 'Pilih File Excel & Import'}
          </button>

          {importResult && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-800">Hasil import</p>
              <p className="mt-1 text-emerald-700">
                {importResult.added} siswa ditambahkan &amp; didaftarkan.
              </p>
              {importResult.skipped > 0 && (
                <p className="text-slate-500">
                  {importResult.skipped} baris dilewati (kosong/judul).
                </p>
              )}
              {importResult.errors.map((er, i) => (
                <p key={i} className="mt-1 text-red-600">
                  {er}
                </p>
              ))}
            </div>
          )}
        </div>
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
