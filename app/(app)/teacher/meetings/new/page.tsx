'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { AcademicTerm, Profile, TeacherAssignment } from '@/lib/types';
import { termLabel, todayISO } from '@/lib/format';
import {
  Field,
  LoadingState,
  PageHeader,
  Spinner,
  btnPrimary,
  inputCls,
} from '@/components/ui';

export default function NewMeetingPage() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState<AcademicTerm | null>(null);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [userId, setUserId] = useState<string>('');

  const [schoolId, setSchoolId] = useState('');
  const [classId, setClassId] = useState('');
  const [meetingDate, setMeetingDate] = useState(todayISO());
  const [actualTeacherId, setActualTeacherId] = useState('');
  const [material, setMaterial] = useState('');
  const [notes, setNotes] = useState('');
  const [previewNumber, setPreviewNumber] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
        // hanya kelas yang ditugaskan pada guru ini (admin: semua penugasan)
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

  // Preview nomor pertemuan (hanya tampilan — nilai final diisi trigger server)
  useEffect(() => {
    if (!classId || !term) {
      setPreviewNumber(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('meetings')
        .select('meeting_number')
        .eq('class_id', classId)
        .eq('term_id', term.id)
        .order('meeting_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPreviewNumber((data?.meeting_number ?? 0) + 1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!term) return;
    setSaving(true);
    // JANGAN kirim meeting_number — trigger server yang mengisi
    const { data: meeting, error } = await supabase
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
      .select()
      .single();
    setSaving(false);
    if (error || !meeting) {
      toast(
        error?.message.includes('row-level security')
          ? 'Kamu tidak ditugaskan di kelas ini'
          : 'Gagal menyimpan: ' + (error?.message ?? ''),
        'error'
      );
      return;
    }
    toast('Laporan tersimpan — lanjut isi presensi');
    router.push(`/teacher/meetings/${meeting.id}`);
  }

  if (loading) return <LoadingState />;

  if (!term) {
    return (
      <div>
        <PageHeader title="Buat Laporan Pertemuan" />
        <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-6 text-sm text-yellow-800">
          Belum ada tahun ajaran aktif. Hubungi admin untuk mengaktifkan term
          terlebih dahulu.
        </p>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div>
        <PageHeader title="Buat Laporan Pertemuan" />
        <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-6 text-sm text-yellow-800">
          Kamu belum ditugaskan di kelas mana pun untuk term{' '}
          {termLabel(term)}. Hubungi admin untuk penugasan.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Buat Laporan Pertemuan"
        subtitle={`Term aktif: ${termLabel(term)}`}
      />

      <form
        onSubmit={save}
        className="space-y-4 rounded-xl border border-slate-200 shadow-sm bg-white p-5"
      >
        <Field label="Sekolah" required>
          <select
            className={inputCls}
            value={schoolId}
            onChange={(e) => {
              setSchoolId(e.target.value);
              setClassId('');
            }}
            required
          >
            <option value="">— pilih sekolah —</option>
            {schoolOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Kelas" required>
          <select
            className={inputCls}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            required
            disabled={!schoolId}
          >
            <option value="">— pilih kelas —</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Pertemuan" required>
            <input
              type="date"
              className={inputCls}
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Pertemuan ke-" hint="Otomatis dari server">
            <input
              className={inputCls}
              value={previewNumber ? `${previewNumber} (perkiraan)` : '—'}
              disabled
              readOnly
            />
          </Field>
        </div>

        {scheduledAssignment && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Guru utama:{' '}
            <span className="font-medium">
              {scheduledAssignment.profiles?.full_name}
            </span>
          </p>
        )}

        <Field
          label="Guru Pelaksana"
          required
          hint="Ubah bila yang mengajar bukan kamu (guru pengganti)"
        >
          <select
            className={inputCls}
            value={actualTeacherId}
            onChange={(e) => setActualTeacherId(e.target.value)}
            required
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
                {t.id === userId ? ' (kamu)' : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Materi" required>
          <textarea
            className={`${inputCls} min-h-24`}
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="Materi yang diajarkan hari ini…"
            required
          />
        </Field>

        <Field label="Catatan">
          <textarea
            className={`${inputCls} min-h-16`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opsional"
          />
        </Field>

        <button
          type="submit"
          className={`${btnPrimary} w-full`}
          disabled={saving || !classId}
        >
          {saving && <Spinner className="h-4 w-4" />}
          Simpan & Lanjut Isi Presensi
        </button>
        <p className="text-center text-xs text-slate-400">
          Setelah disimpan, presensi semua siswa aktif otomatis terisi
          &quot;hadir&quot; — kamu tinggal mengubah yang tidak hadir.
        </p>
      </form>
    </div>
  );
}
