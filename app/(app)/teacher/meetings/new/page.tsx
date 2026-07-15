'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  DoorOpen,
  ImagePlus,
  Loader2,
  Plus,
  Repeat2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type {
  AcademicTerm,
  AttendanceStatus,
  Profile,
  Student,
  TeacherAssignment,
} from '@/lib/types';
import { ATTENDANCE_STATUSES, STORAGE_BUCKET } from '@/lib/types';
import { termLabel, todayISO } from '@/lib/format';
import { LoadingState, PageHeader } from '@/components/ui';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa',
};

const STATUS_SOLID: Record<AttendanceStatus, string> = {
  hadir: 'bg-emerald-600 text-white',
  izin: 'bg-amber-500 text-white',
  sakit: 'bg-sky-600 text-white',
  alpa: 'bg-red-600 text-white',
};

const STATUS_CHIP: Record<AttendanceStatus, string> = {
  hadir: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  izin: 'bg-amber-50 text-amber-700 ring-amber-200',
  sakit: 'bg-sky-50 text-sky-700 ring-sky-200',
  alpa: 'bg-red-50 text-red-700 ring-red-200',
};

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">
      {n}
    </span>
  );
}

export default function NewMeetingPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState<AcademicTerm | null>(null);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [userId, setUserId] = useState('');

  // Field form
  const [schoolId, setSchoolId] = useState('');
  const [classId, setClassId] = useState('');
  const [meetingDate, setMeetingDate] = useState(todayISO());
  const [actualTeacherId, setActualTeacherId] = useState('');
  const [material, setMaterial] = useState('');
  const [notes, setNotes] = useState('');
  const [previewNumber, setPreviewNumber] = useState<number | null>(null);

  // Absensi
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>(
    {}
  );

  // tambah siswa inline
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentNis, setNewStudentNis] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  // foto
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  // simpan
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMeetingId, setSavedMeetingId] = useState<string | null>(null);

  // ---- muat data awal ----
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setActualTeacherId(user.id);

      const { data: termData } = await supabase
        .from('academic_terms')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      const activeTerm = termData as AcademicTerm | null;
      setTerm(activeTerm);

      if (activeTerm) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('roles:role_id(name)')
          .eq('id', user.id)
          .single();
        const isAdmin = (profile?.roles as any)?.name === 'admin';

        let q = supabase
          .from('teacher_assignments')
          .select(
            '*, schools:school_id(id, name), classes:class_id(id, name), profiles:teacher_id(id, full_name)'
          )
          .eq('term_id', activeTerm.id)
          .eq('is_active', true);
        if (!isAdmin) q = q.eq('teacher_id', user.id);
        const { data: asg } = await q;
        setAssignments((asg as TeacherAssignment[]) ?? []);
      }

      const { data: profs } = await supabase
        .from('profiles')
        .select('*, roles:role_id(name)')
        .eq('is_active', true)
        .order('full_name');
      setTeachers(
        ((profs as Profile[]) ?? []).filter((p) => p.roles?.name === 'guru')
      );

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schoolOptions = useMemo(() => {
    const seen = new Map<string, string>();
    assignments.forEach((a) => {
      if (a.schools) seen.set(a.schools.id, a.schools.name);
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [assignments]);

  const classOptions = useMemo(
    () =>
      assignments
        .filter((a) => a.school_id === schoolId)
        .map((a) => ({ id: a.class_id, name: a.classes?.name ?? '' })),
    [assignments, schoolId]
  );

  const scheduledAssignment = useMemo(
    () => assignments.find((a) => a.class_id === classId),
    [assignments, classId]
  );

  const selectedClassName = classOptions.find((c) => c.id === classId)?.name;
  const selectedSchoolName = schoolOptions.find((s) => s.id === schoolId)?.name;

  const isPengganti =
    !!scheduledAssignment &&
    !!actualTeacherId &&
    scheduledAssignment.teacher_id !== actualTeacherId;

  // ---- muat siswa ter-enroll saat kelas / tanggal berubah ----
  useEffect(() => {
    if (!classId || !term) {
      setStudents([]);
      setStatusMap({});
      setPreviewNumber(null);
      return;
    }
    let cancelled = false;
    setLoadingStudents(true);
    (async () => {
      // preview nomor pertemuan (tampilan saja; nilai final dari trigger server)
      const { data: last } = await supabase
        .from('meetings')
        .select('meeting_number')
        .eq('class_id', classId)
        .eq('term_id', term.id)
        .order('meeting_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setPreviewNumber((last?.meeting_number ?? 0) + 1);

      // siswa aktif yang ter-enroll pada tanggal pertemuan (mirror trigger seed)
      const { data } = await supabase
        .from('enrollments')
        .select('students:student_id(id, full_name, nis, status)')
        .eq('class_id', classId)
        .eq('term_id', term.id)
        .eq('is_active', true)
        .lte('start_date', meetingDate)
        .or(`end_date.is.null,end_date.gte.${meetingDate}`);
      if (cancelled) return;
      const list = ((data as any[]) ?? [])
        .map((row) => row.students as Student)
        .filter((s) => s && s.status === 'aktif')
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
      setStudents(list);
      setStatusMap(
        Object.fromEntries(list.map((s) => [s.id, 'hadir' as const]))
      );
      setLoadingStudents(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, meetingDate, term]);

  async function addStudentInline() {
    const name = newStudentName.trim();
    if (!name || !classId || !term) return;
    setAddingStudent(true);
    setError(null);
    // buat identitas siswa
    const { data: st, error: stErr } = await supabase
      .from('students')
      .insert({ full_name: name, nis: newStudentNis.trim() || null })
      .select()
      .single();
    if (stErr || !st) {
      setAddingStudent(false);
      setError('Gagal menambah siswa: ' + (stErr?.message ?? ''));
      return;
    }
    // enroll ke kelas ini mulai tanggal pertemuan
    const { error: enErr } = await supabase.from('enrollments').insert({
      student_id: (st as Student).id,
      class_id: classId,
      term_id: term.id,
      start_date: meetingDate,
    });
    setAddingStudent(false);
    if (enErr && enErr.code !== '23505') {
      setError(
        enErr.message.includes('row-level security')
          ? 'Kamu tidak ditugaskan di kelas ini'
          : 'Gagal mendaftarkan siswa: ' + enErr.message
      );
      return;
    }
    const student = st as Student;
    setStudents((prev) =>
      [...prev, student].sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      )
    );
    setStatusMap((prev) => ({ ...prev, [student.id]: 'hadir' }));
    setNewStudentName('');
    setNewStudentNis('');
  }

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setPhotos((prev) => {
      const room = 2 - prev.length;
      const accepted = files.slice(0, room).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setPhotoWarning(
        files.length > room ? 'Maksimal 2 foto — sisanya diabaikan.' : null
      );
      return [...prev, ...accepted];
    });
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoWarning(null);
  }

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = {
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
    };
    for (const s of students) c[statusMap[s.id] ?? 'hadir']++;
    return c;
  }, [students, statusMap]);

  const canSave = !!classId && !!meetingDate && !!actualTeacherId && !saving;

  async function save() {
    if (!canSave || !term) return;
    setSaving(true);
    setError(null);
    setPhotoWarning(null);

    // 1) insert meeting (tanpa meeting_number — trigger server yang mengisi,
    //    sekaligus seed baris presensi 'hadir' untuk siswa ter-enroll)
    const { data: meeting, error: mErr } = await supabase
      .from('meetings')
      .insert({
        school_id: schoolId,
        class_id: classId,
        term_id: term.id,
        scheduled_teacher_id: scheduledAssignment?.teacher_id ?? null,
        actual_teacher_id: actualTeacherId,
        meeting_date: meetingDate,
        material: material.trim() || null,
        notes: notes.trim() || null,
        created_by: userId,
      })
      .select('id')
      .single();
    if (mErr || !meeting) {
      setSaving(false);
      setError(
        mErr?.message.includes('row-level security')
          ? 'Kamu tidak ditugaskan di kelas ini'
          : 'Gagal menyimpan pertemuan: ' + (mErr?.message ?? '')
      );
      return;
    }
    const meetingId = (meeting as { id: string }).id;

    // 2) terapkan status presensi (upsert menimpa hasil seed trigger)
    if (students.length > 0) {
      const rows = students.map((s) => ({
        meeting_id: meetingId,
        student_id: s.id,
        student_name_snapshot: s.full_name,
        status: statusMap[s.id] ?? 'hadir',
      }));
      const { error: attErr } = await supabase
        .from('attendance')
        .upsert(rows, { onConflict: 'meeting_id,student_id' });
      if (attErr) {
        setSaving(false);
        setError(
          'Pertemuan tersimpan, tetapi presensi gagal disimpan: ' +
            attErr.message
        );
        return;
      }
    }

    // 3) unggah foto (opsional)
    for (const p of photos) {
      const ext = (p.file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${meetingId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, p.file, { contentType: p.file.type || 'image/jpeg' });
      if (upErr) {
        setPhotoWarning('Sebagian foto gagal diunggah: ' + upErr.message);
        continue;
      }
      const { error: rowErr } = await supabase
        .from('meeting_photos')
        .insert({ meeting_id: meetingId, file_path: path });
      if (rowErr)
        setPhotoWarning('Foto terunggah tetapi gagal dicatat: ' + rowErr.message);
    }

    setSaving(false);
    setSavedMeetingId(meetingId);
  }

  function resetForm() {
    setClassId('');
    setMeetingDate(todayISO());
    setActualTeacherId(userId);
    setMaterial('');
    setNotes('');
    setStudents([]);
    setStatusMap({});
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setSavedMeetingId(null);
    setError(null);
    setPhotoWarning(null);
  }

  if (loading) return <LoadingState />;

  if (!term) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Buat Laporan Pertemuan" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
          Belum ada tahun ajaran aktif. Hubungi admin untuk mengaktifkan term
          terlebih dahulu.
        </p>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Buat Laporan Pertemuan" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
          Kamu belum ditugaskan di kelas mana pun untuk term {termLabel(term)}.
          Hubungi admin untuk penugasan.
        </p>
      </div>
    );
  }

  // ===== layar sukses =====
  if (savedMeetingId) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CircleCheck className="h-11 w-11 text-emerald-600" strokeWidth={1.8} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Laporan tersimpan!
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Pertemuan, presensi siswa, dan dokumentasi sudah tercatat.
          </p>
          {photoWarning && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700 ring-1 ring-amber-200">
              {photoWarning}
            </p>
          )}
          <div className="mt-7 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Link
              href={`/teacher/meetings/${savedMeetingId}`}
              className="btn-secondary"
            >
              Lihat Detail
            </Link>
            <button onClick={resetForm} className="btn-primary">
              <Plus className="h-4 w-4" /> Buat Laporan Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Buat Laporan Pertemuan"
        subtitle={`Term aktif: ${termLabel(term)} — isi semua di satu halaman lalu simpan`}
      />

      <div className="space-y-5">
        {/* 1. Kelas & tanggal */}
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <StepBadge n={1} />
            <h2 className="font-semibold text-slate-900">Kelas & Tanggal</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">Sekolah</label>
              <select
                className="input"
                value={schoolId}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  setClassId('');
                }}
              >
                <option value="">— pilih sekolah —</option>
                {schoolOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {schoolId && (
              <div>
                <label className="label">Kelas</label>
                <select
                  className="input"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  <option value="">— pilih kelas —</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tanggal</label>
                <input
                  type="date"
                  className="input"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Pertemuan ke-</label>
                <div className="input flex items-center bg-slate-50 text-slate-500">
                  {previewNumber ? `${previewNumber} (perkiraan)` : '—'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Pengajar & materi */}
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <StepBadge n={2} />
            <h2 className="font-semibold text-slate-900">Pengajar & Materi</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <UserRound className="h-3.5 w-3.5" /> Guru utama kelas ini
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {!classId
                  ? '— pilih kelas dulu —'
                  : (scheduledAssignment?.profiles?.full_name ??
                    'Belum ditetapkan admin')}
              </p>
            </div>
            <div>
              <label className="label">Yang mengajar hari ini</label>
              <select
                className="input"
                value={actualTeacherId}
                onChange={(e) => setActualTeacherId(e.target.value)}
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                    {t.id === userId ? ' (kamu)' : ''}
                    {t.id === scheduledAssignment?.teacher_id
                      ? ' — guru utama'
                      : ''}
                  </option>
                ))}
              </select>
              {isPengganti && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                  <Repeat2 className="h-3.5 w-3.5" />
                  Pengganti — menggantikan{' '}
                  {scheduledAssignment?.profiles?.full_name ?? 'guru utama'}
                </p>
              )}
            </div>
            <div>
              <label className="label">Materi yang diajarkan</label>
              <textarea
                className="input min-h-20 resize-y"
                placeholder="cth. Merakit sensor ultrasonik + coding gerak maju-mundur"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
            </div>
            <div>
              <label className="label">
                Catatan{' '}
                <span className="font-normal text-slate-400">(opsional)</span>
              </label>
              <input
                className="input"
                placeholder="Info tambahan bila perlu"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* 3. Absensi */}
        <section className="card p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2.5">
            <StepBadge n={3} />
            <h2 className="font-semibold text-slate-900">Absensi Siswa</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            {selectedClassName ? (
              <>
                Kelas <b>{selectedClassName}</b>
                {selectedSchoolName ? ` · ${selectedSchoolName}` : ''} — semua
                otomatis <b>hadir</b>, cukup ubah yang absen.
              </>
            ) : (
              <>
                Semua siswa otomatis <b>hadir</b> — cukup ubah yang tidak hadir.
              </>
            )}
          </p>

          {!classId ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-center text-slate-400">
              <DoorOpen className="h-6 w-6" />
              <p className="text-sm">
                Pilih sekolah &amp; kelas dulu untuk memunculkan daftar siswa
              </p>
            </div>
          ) : loadingStudents ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" /> Memuat siswa…
            </div>
          ) : (
            <>
              {students.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {ATTENDANCE_STATUSES.map((s) =>
                    counts[s] > 0 ? (
                      <span
                        key={s}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_CHIP[s]}`}
                      >
                        {counts[s]} {STATUS_LABEL[s]}
                      </span>
                    ) : null
                  )}
                </div>
              )}

              {students.length === 0 && (
                <div className="mb-4 flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-slate-400">
                  <Users className="h-6 w-6" />
                  <p className="text-sm">
                    Belum ada siswa di kelas ini — tambahkan di bawah.
                  </p>
                </div>
              )}

              <ul className="divide-y divide-slate-100">
                {students.map((st, i) => {
                  const current = statusMap[st.id] ?? 'hadir';
                  return (
                    <li
                      key={st.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
                    >
                      <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                        <span className="mr-2 inline-block w-5 text-right text-xs text-slate-400">
                          {i + 1}.
                        </span>
                        {st.full_name}
                      </span>
                      <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
                        {ATTENDANCE_STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setStatusMap((prev) => ({ ...prev, [st.id]: s }))
                            }
                            className={`px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 ${
                              current === s
                                ? STATUS_SOLID[s]
                                : 'bg-white text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* tambah siswa cepat */}
              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_140px_auto]">
                <input
                  className="input"
                  placeholder="Tambah siswa baru ke kelas ini"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addStudentInline()}
                />
                <input
                  className="input"
                  placeholder="NIS (opsional)"
                  value={newStudentNis}
                  onChange={(e) => setNewStudentNis(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addStudentInline()}
                />
                <button
                  type="button"
                  onClick={addStudentInline}
                  disabled={addingStudent || !newStudentName.trim()}
                  className="btn-secondary shrink-0"
                >
                  {addingStudent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Tambah
                </button>
              </div>
            </>
          )}
        </section>

        {/* 4. Foto */}
        <section className="card p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2.5">
            <StepBadge n={4} />
            <h2 className="font-semibold text-slate-900">Foto Dokumentasi</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Maksimal 2 foto. Tersimpan privat, hanya bisa dilihat anggota.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <div
                key={p.preview}
                className="group relative aspect-video overflow-hidden rounded-xl bg-slate-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.preview}
                  alt={`Foto ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-red-600"
                  aria-label="Hapus foto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {photos.length < 2 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-brand-400 hover:text-brand-500"
              >
                <ImagePlus className="h-6 w-6" />
                <span className="text-xs font-semibold">
                  Tambah foto ({photos.length}/2)
                </span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onPickPhotos}
          />
          {photoWarning && (
            <p className="mt-3 flex items-center gap-2 text-sm text-amber-600">
              <CircleAlert className="h-4 w-4" /> {photoWarning}
            </p>
          )}
        </section>

        {/* simpan */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={save}
          disabled={!canSave}
          className="btn-primary w-full py-4 text-base shadow-lg shadow-brand-600/25"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Menyimpan…
            </>
          ) : (
            <>
              <ClipboardCheck className="h-5 w-5" /> Simpan Laporan
            </>
          )}
        </button>
        {!classId && (
          <p className="-mt-2 text-center text-xs text-slate-400">
            Pilih sekolah &amp; kelas untuk mulai mengisi presensi.
          </p>
        )}
      </div>
    </div>
  );
}
