'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { AcademicTerm, Meeting } from '@/lib/types';
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
  const [termFilter, setTermFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('academic_terms')
        .select('*')
        .order('year_label', { ascending: false });
      const list = (data as AcademicTerm[]) ?? [];
      setTerms(list);
      const active = list.find((t) => t.is_active);
      setTermFilter(active?.id ?? '');
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
    if (termFilter) query = query.eq('term_id', termFilter);
    const { data, error } = await query;
    if (error) toast('Gagal memuat pertemuan: ' + error.message, 'error');
    setMeetings((data as Meeting[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Pertemuan Saya"
        subtitle="Laporan pertemuan kelas yang kamu ampu"
        action={
          <Link href="/teacher/meetings/new" className={btnPrimary}>
            + Buat Laporan
          </Link>
        }
      />

      <select
        className={`${inputCls} mb-4 max-w-sm`}
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

      {loading ? (
        <LoadingState />
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
              className="rounded-xl border border-gray-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  Pertemuan ke-{m.meeting_number}
                </span>
                <span className="text-xs text-gray-400">
                  📷 {m.meeting_photos?.length ?? 0}/2
                </span>
              </div>
              <p className="mt-2 font-semibold text-gray-900">
                {m.schools?.name} — Kelas {m.classes?.name}
              </p>
              <p className="text-sm text-gray-500">
                {formatDateShort(m.meeting_date)} ·{' '}
                {m.actual_teacher?.full_name}
              </p>
              {m.material && (
                <p className="mt-2 line-clamp-2 text-sm text-gray-600">
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
