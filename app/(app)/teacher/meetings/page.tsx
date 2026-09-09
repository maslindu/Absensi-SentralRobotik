'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { AcademicTerm, Meeting, TeacherAssignment } from '@/lib/types';
import { formatDateShort, termLabel } from '@/lib/format';
import {
  EmptyState,
  LoadingState,
  PageHeader,
  btnPrimary,
  inputCls,
} from '@/components/ui';

export default function TeacherMeetingsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [termFilter, setTermFilter] = useState<string>('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [termResult, userResult] = await Promise.all([
        supabase
          .from('academic_terms')
          .select('*')
          .order('year_label', { ascending: false }),
        supabase.auth.getUser(),
      ]);
      const { data } = termResult;
      const list = (data as AcademicTerm[]) ?? [];
      setTerms(list);
      const active = list.find((t) => t.is_active);
      setTermFilter(active?.id ?? '');
      if (userResult.data.user) {
        const { data: assignmentData } = await supabase
          .from('teacher_assignments')
          .select('*, schools:school_id(id, name), classes:class_id(id, name)')
          .eq('teacher_id', userResult.data.user.id)
          .eq('is_active', true);
        setAssignments((assignmentData as TeacherAssignment[]) ?? []);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!termFilter || !schoolFilter || !classFilter) {
      setMeetings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from('meetings')
      .select(
        '*, schools:school_id(id, name), classes:class_id(id, name), actual_teacher:actual_teacher_id(id, full_name), meeting_photos(id)'
      )
      .order('meeting_date', { ascending: false })
      .order('created_at', { ascending: false });
    query = query
      .eq('term_id', termFilter)
      .eq('school_id', schoolFilter)
      .eq('class_id', classFilter);
    const { data, error } = await query;
    if (error) toast('Gagal memuat pertemuan: ' + error.message, 'error');
    setMeetings((data as Meeting[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termFilter, schoolFilter, classFilter]);

  useEffect(() => {
    load();
  }, [load]);

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
        title="Pertemuan Saya"
        subtitle="Laporan pertemuan kelas yang kamu ampu"
        action={
          <Link href="/teacher/meetings/new" className={btnPrimary}>
            <Plus className="h-4 w-4" /> Buat Laporan
          </Link>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
      <select
        aria-label="Filter term"
        className={inputCls}
        value={termFilter}
        onChange={(e) => setTermFilter(e.target.value)}
      >
        <option value="">Semua term</option>
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            {termLabel(t)}
            {t.is_active ? ' (aktif)' : ''}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter sekolah"
        className={inputCls}
        value={schoolFilter}
        onChange={(e) => {
          setSchoolFilter(e.target.value);
          setClassFilter('');
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
        aria-label="Filter kelas"
        className={inputCls}
        value={classFilter}
        onChange={(e) => setClassFilter(e.target.value)}
        disabled={!schoolFilter}
      >
        <option value="">Pilih kelas</option>
        {classesOfSchool.map((assignment) => (
          <option key={assignment.id} value={assignment.class_id}>
            Kelas {assignment.classes?.name}
          </option>
        ))}
      </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : !schoolFilter || !classFilter ? (
        <EmptyState
          title="Pilih sekolah dan kelas"
          hint="Laporan pertemuan akan dimuat setelah kamu memilih kelas."
        />
      ) : meetings.length === 0 ? (
        <EmptyState
          title="Belum ada laporan"
          hint="Buat laporan pertemuan pertamamu."
          action={
            <Link href="/teacher/meetings/new" className={btnPrimary}>
              + Buat Laporan
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((m) => (
            <Link
              key={m.id}
              href={`/teacher/meetings/${m.id}`}
              className="card p-4 transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                  Pertemuan ke-{m.meeting_number}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {m.meeting_photos?.length ?? 0}/2
                </span>
              </div>
              <p className="mt-2 font-semibold text-slate-900">
                {m.schools?.name} — Kelas {m.classes?.name}
              </p>
              <p className="text-sm text-slate-500">
                {formatDateShort(m.meeting_date)} ·{' '}
                {m.actual_teacher?.full_name}
              </p>
              {m.material && (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                  {m.material}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
