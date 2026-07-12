'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { Meeting, Profile, School } from '@/lib/types';
import { currentMonthISO, formatDateShort } from '@/lib/format';
import {
  EmptyState,
  LoadingState,
  PageHeader,
  inputCls,
} from '@/components/ui';

export default function MonitorPage() {
  const supabase = createClient();
  const toast = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [month, setMonth] = useState(currentMonthISO()); // '' = semua
  const [schoolFilter, setSchoolFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');

  useEffect(() => {
    (async () => {
      const [sch, prof] = await Promise.all([
        supabase.from('schools').select('*').order('name'),
        supabase
          .from('profiles')
          .select('*, roles:role_id(name)')
          .order('full_name'),
      ]);
      setSchools((sch.data as School[]) ?? []);
      setTeachers(
        ((prof.data as Profile[]) ?? []).filter(
          (p) => p.roles?.name === 'guru'
        )
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('meetings')
      .select(
        '*, schools:school_id(id, name), classes:class_id(id, name), actual_teacher:actual_teacher_id(id, full_name), meeting_photos(id)'
      )
      .order('meeting_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (month) {
      const start = `${month}-01`;
      const next = new Date(`${start}T00:00:00`);
      next.setMonth(next.getMonth() + 1);
      query = query
        .gte('meeting_date', start)
        .lt('meeting_date', next.toISOString().slice(0, 10));
    }
    if (schoolFilter) query = query.eq('school_id', schoolFilter);
    if (teacherFilter) query = query.eq('actual_teacher_id', teacherFilter);

    const { data, error } = await query;
    if (error) toast('Gagal memuat data: ' + error.message, 'error');
    setMeetings((data as Meeting[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, schoolFilter, teacherFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const uniqueTeachers = new Set(meetings.map((m) => m.actual_teacher_id))
    .size;
  const uniqueSchools = new Set(meetings.map((m) => m.school_id)).size;

  return (
    <div>
      <PageHeader
        title="Monitoring Pertemuan"
        subtitle="Seluruh laporan pertemuan semua guru"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="month"
          className={`${inputCls} w-auto`}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <select
          className={`${inputCls} w-auto`}
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
        <select
          className={`${inputCls} w-auto`}
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
        >
          <option value="">Semua guru</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        {month && (
          <button
            className="text-sm text-blue-600 hover:underline"
            onClick={() => setMonth('')}
          >
            Tampilkan semua bulan
          </button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold">{meetings.length}</p>
          <p className="text-xs text-gray-500">Pertemuan</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold">{uniqueTeachers}</p>
          <p className="text-xs text-gray-500">Guru mengajar</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold">{uniqueSchools}</p>
          <p className="text-xs text-gray-500">Sekolah</p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : meetings.length === 0 ? (
        <EmptyState
          title="Belum ada pertemuan untuk filter ini"
          hint="Coba ubah bulan atau filter lainnya."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Guru Pelaksana</th>
                <th className="px-4 py-3">Sekolah</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Ke-</th>
                <th className="px-4 py-3">Materi</th>
                <th className="px-4 py-3">Foto</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-gray-50 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/teacher/meetings/${m.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {formatDateShort(m.meeting_date)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {m.actual_teacher?.full_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.schools?.name}
                  </td>
                  <td className="px-4 py-3">{m.classes?.name}</td>
                  <td className="px-4 py-3">{m.meeting_number}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-gray-600">
                    {m.material || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {m.meeting_photos?.length ?? 0}/2
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
