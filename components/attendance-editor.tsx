'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { Attendance, AttendanceStatus, Student } from '@/lib/types';
import { ATTENDANCE_STATUSES } from '@/lib/types';
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
  hadir: 'bg-green-600 text-white border-green-600',
  izin: 'bg-yellow-500 text-white border-yellow-500',
  sakit: 'bg-blue-600 text-white border-blue-600',
  alpa: 'bg-red-600 text-white border-red-600',
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
    setRows((data as Attendance[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(row: Attendance, status: AttendanceStatus) {
    if (readOnly || row.status === status) return;
    setSavingId(row.id);
    const { error } = await supabase
      .from('attendance')
      .update({ status })
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      toast('Gagal menyimpan status: ' + error.message, 'error');
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r)));
  }

  async function saveRemarks(row: Attendance, remarks: string) {
    if (readOnly) return;
    const value = remarks.trim() || null;
    if ((row.remarks ?? null) === value) return;
    const { error } = await supabase
      .from('attendance')
      .update({ remarks: value })
      .eq('id', row.id);
    if (error) {
      toast('Gagal menyimpan keterangan', 'error');
      return;
    }
    setRows((rs) =>
      rs.map((r) => (r.id === row.id ? { ...r, remarks: value } : r))
    );
  }

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
        const chosen = existingStudents.find(
          (s) => s.id === selectedStudentId
        );
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
      // 23505 = sudah ter-enroll di kelas+term ini — tidak apa-apa, lanjut
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

      toast(`${studentName} ditambahkan ke pertemuan ini`);
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
      `${row.student_name_snapshot} dikeluarkan — tidak muncul di pertemuan berikutnya`
    );
  }

  if (loading) return <LoadingState text="Memuat presensi…" />;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {rows.length} siswa ·{' '}
          {rows.filter((r) => r.status === 'hadir').length} hadir
        </p>
        {!readOnly && (
          <button className={btnSmall} onClick={openAdd}>
            ➕ Tambah Siswa
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada siswa di presensi"
          hint="Pastikan siswa sudah ter-enroll di kelas ini, atau tambahkan lewat tombol Tambah Siswa."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-gray-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900">
                  {row.student_name_snapshot}
                  {savingId === row.id && (
                    <Spinner className="ml-2 inline h-3.5 w-3.5 text-gray-400" />
                  )}
                </p>
                {!readOnly && (
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => setToRemove(row)}
                  >
                    ➖ Keluarkan
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {ATTENDANCE_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setStatus(row, st)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      row.status === st
                        ? STATUS_ACTIVE_CLS[st]
                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    } ${readOnly ? 'cursor-default' : ''}`}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
              {(!readOnly || row.remarks) && (
                <input
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none disabled:border-transparent disabled:bg-transparent disabled:px-0"
                  placeholder="Keterangan (opsional)"
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
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600'
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
                : 'border-gray-200 text-gray-600'
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
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Siswa akan di-enroll ke kelas ini (mulai {meetingDate}) dan
            langsung muncul di presensi pertemuan ini dengan status hadir.
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
