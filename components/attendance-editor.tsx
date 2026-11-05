'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, UserMinus, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { backdateEnrollments } from '@/lib/enrollment';
import { useToast } from '@/components/toast';
import type {
  Attendance,
  AttendanceStatus,
  ProgressLevel,
  Student,
} from '@/lib/types';
import {
  ATTENDANCE_STATUSES,
  PROGRESS_LABEL,
  PROGRESS_LEVELS,
  SCORE_MAX,
} from '@/lib/types';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  Spinner,
  btnPrimary,
  btnSecondary,
  btnSmall,
  inputCls,
} from '@/components/ui';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa',
};

const STATUS_ACTIVE_CLS: Record<AttendanceStatus, string> = {
  hadir: 'bg-emerald-600 text-white border-emerald-600',
  izin: 'bg-amber-500 text-white border-amber-500',
  sakit: 'bg-sky-600 text-white border-sky-600',
  alpa: 'bg-red-600 text-white border-red-600',
};

const PROGRESS_ACTIVE_CLS: Record<ProgressLevel, string> = {
  berkembang: 'bg-emerald-600 text-white border-emerald-600',
  cukup: 'bg-amber-500 text-white border-amber-500',
  belum: 'bg-slate-600 text-white border-slate-600',
};

export default function AttendanceEditor({
  meetingId,
  classId,
  termId,
  meetingDate,
  readOnly,
}: {
  meetingId: string;
  classId: string;
  termId: string;
  meetingDate: string;
  readOnly: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  // id baris yang baru saja tersimpan -> tampilkan centang sesaat
  const [savedId, setSavedId] = useState<string | null>(null);

  // tambah siswa saat pertemuan berlangsung
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'baru' | 'sudah-ada'>('baru');
  const [newName, setNewName] = useState('');
  const [newNis, setNewNis] = useState('');
  const [existingStudents, setExistingStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [adding, setAdding] = useState(false);

  // keluarkan siswa
  const [toRemove, setToRemove] = useState<Attendance | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('student_name_snapshot');
    if (error) toast('Gagal memuat presensi: ' + error.message, 'error');
    // Normalkan kolom penilaian ke null. Bila migrasi student_scores.sql belum
    // dijalankan, kolomnya belum ada sehingga nilainya `undefined` — dan
    // perbandingan `!== null` akan keliru menganggapnya sudah dinilai.
    setRows(
      ((data as Attendance[]) ?? []).map((r) => ({
        ...r,
        score: r.score ?? null,
        progress: r.progress ?? null,
      }))
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    load();
  }, [load]);

  function flashSaved(id: string) {
    setSavedId(id);
    setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1200);
  }

  // Satu pintu penyimpanan untuk status/nilai/progres/keterangan agar
  // indikator "menyimpan" dan "tersimpan" konsisten di seluruh baris.
  async function patchRow(row: Attendance, patch: Partial<Attendance>) {
    if (readOnly) return;
    setSavingId(row.id);
    const { error } = await supabase
      .from('attendance')
      .update(patch)
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      toast('Gagal menyimpan: ' + error.message, 'error');
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    flashSaved(row.id);
  }

  function setStatus(row: Attendance, status: AttendanceStatus) {
    if (row.status === status) return;
    patchRow(row, { status });
  }

  // Tap chip yang sama = batalkan penilaian (kembali ke "belum dinilai").
  function setProgress(row: Attendance, progress: ProgressLevel) {
    patchRow(row, { progress: row.progress === progress ? null : progress });
  }

  function saveScore(row: Attendance, raw: string) {
    const text = raw.trim();
    if (text === '') {
      if (row.score === null) return;
      patchRow(row, { score: null });
      return;
    }
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > SCORE_MAX) {
      toast('Nilai harus berupa angka 0-' + SCORE_MAX, 'error');
      return;
    }
    if (row.score !== null && Math.abs(row.score - value) < 0.001) return;
    patchRow(row, { score: value });
  }

  function saveRemarks(row: Attendance, remarks: string) {
    const value = remarks.trim() || null;
    if ((row.remarks ?? null) === value) return;
    patchRow(row, { remarks: value });
  }

  const stats = useMemo(
    () => ({
      hadir: rows.filter((r) => r.status === 'hadir').length,
      dinilai: rows.filter((r) => r.score !== null || r.progress !== null)
        .length,
    }),
    [rows]
  );

  async function openAdd() {
    setAddMode('baru');
    setNewName('');
    setNewNis('');
    setSelectedStudentId('');
    setAddOpen(true);
    // siswa aktif yang BELUM ada di presensi pertemuan ini
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('status', 'aktif')
      .order('full_name');
    const inMeeting = new Set(rows.map((r) => r.student_id));
    setExistingStudents(
      ((data as Student[]) ?? []).filter((s) => !inMeeting.has(s.id))
    );
  }

  // Alur README §11: buat siswa (bila baru) -> enrollment -> baris attendance
  // untuk pertemuan yang sedang berjalan (seeding tidak retroaktif).
  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      let studentId: string;
      let studentName: string;

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
        studentName = student.full_name;
      } else {
        const chosen = existingStudents.find((s) => s.id === selectedStudentId);
        if (!chosen) return;
        studentId = chosen.id;
        studentName = chosen.full_name;
      }

      const { error: enrollErr } = await supabase.from('enrollments').insert({
        student_id: studentId,
        class_id: classId,
        term_id: termId,
        start_date: meetingDate,
      });
      // 23505 = sudah ter-enroll di kelas+term ini — pastikan tanggal mulainya
      // mencakup tanggal pertemuan (mis. laporan backdate), lalu lanjut
      if (enrollErr?.code === '23505') {
        await backdateEnrollments(supabase, {
          studentIds: [studentId],
          classId,
          termId,
          date: meetingDate,
        });
      }
      if (enrollErr && enrollErr.code !== '23505') {
        toast(
          enrollErr.message.includes('row-level security')
            ? 'Kamu tidak ditugaskan di kelas ini'
            : 'Gagal enrollment: ' + enrollErr.message,
          'error'
        );
        return;
      }

      const { error: attErr } = await supabase.from('attendance').insert({
        meeting_id: meetingId,
        student_id: studentId,
        student_name_snapshot: studentName,
        status: 'hadir',
      });
      if (attErr && attErr.code !== '23505') {
        toast('Gagal menambah presensi: ' + attErr.message, 'error');
        return;
      }

      toast(studentName + ' ditambahkan ke pertemuan ini');
      setAddOpen(false);
      load();
    } finally {
      setAdding(false);
    }
  }

  // Keluarkan siswa: isi end_date pada enrollment (bukan hapus).
  async function removeStudent(row: Attendance) {
    setRemoving(true);
    const { data: enroll, error: findErr } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', row.student_id)
      .eq('class_id', classId)
      .eq('term_id', termId)
      .maybeSingle();
    if (findErr || !enroll) {
      setRemoving(false);
      setToRemove(null);
      toast('Enrollment siswa tidak ditemukan', 'error');
      return;
    }
    const { error } = await supabase
      .from('enrollments')
      .update({ end_date: meetingDate, is_active: false })
      .eq('id', enroll.id);
    setRemoving(false);
    setToRemove(null);
    if (error) {
      toast('Gagal mengeluarkan siswa: ' + error.message, 'error');
      return;
    }
    toast(
      row.student_name_snapshot +
        ' dikeluarkan — tidak muncul di pertemuan berikutnya'
    );
  }

  if (loading) return <LoadingState text="Memuat presensi…" />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
            {rows.length} siswa
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">
            {stats.hadir} hadir
          </span>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 ring-1 ring-brand-100">
            {stats.dinilai}/{rows.length} dinilai
          </span>
        </div>
        {!readOnly && (
          <button className={btnSmall} onClick={openAdd}>
            <UserPlus className="h-3.5 w-3.5" /> Tambah Siswa
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada siswa di presensi"
          hint="Pastikan siswa sudah ter-enroll di kelas ini, atau tambahkan lewat tombol Tambah Siswa."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
                  <span className="truncate">{row.student_name_snapshot}</span>
                  {savingId === row.id && (
                    <Spinner className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  )}
                  {savedId === row.id && savingId !== row.id && (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                </p>
                {!readOnly && (
                  <button
                    className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Keluarkan dari kelas"
                    aria-label={'Keluarkan ' + row.student_name_snapshot}
                    onClick={() => setToRemove(row)}
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Kehadiran — grid agar 4 tombol selalu sejajar & lega di HP */}
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {ATTENDANCE_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setStatus(row, st)}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      row.status === st
                        ? STATUS_ACTIVE_CLS[st]
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    } ${readOnly ? 'cursor-default' : 'active:scale-[0.97]'}`}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </div>

              {/* Penilaian — nilai angka & progres, keduanya opsional */}
              {(!readOnly || row.score !== null || row.progress !== null) && (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">
                      Nilai
                    </span>
                    {readOnly ? (
                      <span className="text-sm font-semibold text-slate-800">
                        {row.score ?? '—'}
                      </span>
                    ) : (
                      <>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={SCORE_MAX}
                          step="any"
                          placeholder="—"
                          defaultValue={row.score ?? ''}
                          onBlur={(e) => saveScore(row, e.target.value)}
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center text-sm font-semibold text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                          aria-label={'Nilai ' + row.student_name_snapshot}
                        />
                        <span className="text-xs text-slate-400">
                          / {SCORE_MAX}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">
                      Progres
                    </span>
                    <div className="flex flex-1 gap-1.5">
                      {PROGRESS_LEVELS.map((lv) => (
                        <button
                          key={lv}
                          type="button"
                          disabled={readOnly}
                          onClick={() => setProgress(row, lv)}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                            row.progress === lv
                              ? PROGRESS_ACTIVE_CLS[lv]
                              : 'border-slate-200 bg-white text-slate-500'
                          } ${
                            readOnly ? 'cursor-default' : 'active:scale-[0.97]'
                          }`}
                        >
                          {PROGRESS_LABEL[lv]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(!readOnly || row.remarks) && (
                <input
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:border-transparent disabled:bg-transparent disabled:px-0"
                  placeholder="Catatan untuk siswa ini (opsional)"
                  defaultValue={row.remarks ?? ''}
                  disabled={readOnly}
                  onBlur={(e) => saveRemarks(row, e.target.value)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Modal tambah siswa */}
      <Modal
        open={addOpen}
        title="Tambah Siswa ke Pertemuan Ini"
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
                    {s.nis ? ' (' + s.nis + ')' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Siswa akan di-enroll ke kelas ini (mulai {meetingDate}) dan langsung
            muncul di presensi pertemuan ini dengan status hadir.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setAddOpen(false)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={adding}>
              {adding && <Spinner className="h-4 w-4" />} Tambahkan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toRemove}
        title="Keluarkan siswa dari kelas?"
        message={`${toRemove?.student_name_snapshot} tidak akan muncul di pertemuan berikutnya. Presensi yang sudah tercatat (termasuk pertemuan ini) tetap tersimpan.`}
        confirmLabel="Keluarkan"
        danger
        loading={removing}
        onConfirm={() => toRemove && removeStudent(toRemove)}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
