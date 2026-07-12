'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { School } from '@/lib/types';
import { currentMonthISO } from '@/lib/format';
import {
  AttendanceBadge,
  EmptyState,
  LoadingState,
  PageHeader,
  Spinner,
  btnPrimary,
  inputCls,
} from '@/components/ui';

interface TeacherSummary {
  pengajar: string;
  sekolah: string;
  jumlah: number;
  tanggal: string[];
}

interface ClassPivot {
  classLabel: string;
  meetingNumbers: number[];
  rows: { name: string; statuses: Record<number, string> }[];
}

export default function ReportsPage() {
  const supabase = createClient();
  const toast = useToast();

  const [month, setMonth] = useState(currentMonthISO());
  const [schoolFilter, setSchoolFilter] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [summary, setSummary] = useState<TeacherSummary[]>([]);
  const [pivots, setPivots] = useState<ClassPivot[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('schools')
        .select('*')
        .order('name');
      setSchools((data as School[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const start = `${month}-01`;
    const next = new Date(`${start}T00:00:00`);
    next.setMonth(next.getMonth() + 1);
    const end = next.toISOString().slice(0, 10);

    let q = supabase
      .from('meetings')
      .select(
        'id, meeting_date, meeting_number, school_id, class_id, actual_teacher:actual_teacher_id(full_name), schools:school_id(name), classes:class_id(name)'
      )
      .gte('meeting_date', start)
      .lt('meeting_date', end)
      .order('meeting_date');
    if (schoolFilter) q = q.eq('school_id', schoolFilter);

    const { data: meetings, error } = await q;
    if (error) {
      toast('Gagal memuat data: ' + error.message, 'error');
      setLoading(false);
      return;
    }
    const meetingList = (meetings ?? []) as any[];

    // Rekap A: ringkasan mengajar per guru per sekolah
    const byKey = new Map<string, TeacherSummary>();
    for (const m of meetingList) {
      const key = `${m.actual_teacher?.full_name}||${m.schools?.name}`;
      const entry: TeacherSummary = byKey.get(key) ?? {
        pengajar: m.actual_teacher?.full_name ?? '-',
        sekolah: m.schools?.name ?? '-',
        jumlah: 0,
        tanggal: [],
      };
      entry.jumlah += 1;
      entry.tanggal.push(m.meeting_date);
      byKey.set(key, entry);
    }
    setSummary([...byKey.values()]);

    // Rekap B: presensi pivot per kelas
    if (meetingList.length > 0) {
      const { data: attendance } = await supabase
        .from('attendance')
        .select('meeting_id, student_name_snapshot, status')
        .in(
          'meeting_id',
          meetingList.map((m) => m.id)
        );
      const attByMeeting = new Map<string, any[]>();
      for (const a of (attendance ?? []) as any[]) {
        const arr = attByMeeting.get(a.meeting_id) ?? [];
        arr.push(a);
        attByMeeting.set(a.meeting_id, arr);
      }

      const byClass = new Map<string, any[]>();
      for (const m of meetingList) {
        const label = `${m.schools?.name} — Kelas ${m.classes?.name}`;
        const arr = byClass.get(label) ?? [];
        arr.push(m);
        byClass.set(label, arr);
      }

      const result: ClassPivot[] = [];
      for (const [classLabel, ms] of byClass) {
        const sorted = [...ms].sort(
          (a, b) => (a.meeting_number ?? 0) - (b.meeting_number ?? 0)
        );
        const students = new Map<string, Record<number, string>>();
        for (const m of sorted) {
          for (const a of attByMeeting.get(m.id) ?? []) {
            const row = students.get(a.student_name_snapshot) ?? {};
            row[m.meeting_number] = a.status;
            students.set(a.student_name_snapshot, row);
          }
        }
        result.push({
          classLabel,
          meetingNumbers: sorted.map((m) => m.meeting_number),
          rows: [...students.keys()].sort().map((name) => ({
            name,
            statuses: students.get(name)!,
          })),
        });
      }
      setPivots(result);
    } else {
      setPivots([]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, schoolFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function doExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ month });
      if (schoolFilter) params.set('school_id', schoolFilter);
      const res = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast(json?.error ?? 'Gagal export', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `presensi-robotik-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast('File .xlsx berhasil diunduh');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Rekap & Export"
        subtitle="Rekap bulanan mengajar guru & presensi siswa"
        action={
          <button
            className={btnPrimary}
            onClick={doExport}
            disabled={exporting || summary.length === 0}
          >
            {exporting && <Spinner className="h-4 w-4" />}
            ⬇ Export Excel (.xlsx)
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
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
      </div>

      {loading ? (
        <LoadingState />
      ) : summary.length === 0 ? (
        <EmptyState
          title="Belum ada data untuk periode ini"
          hint="Coba pilih bulan lain."
        />
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Ringkasan Mengajar Guru
          </h2>
          <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Pengajar</th>
                  <th className="px-4 py-3">Sekolah</th>
                  <th className="px-4 py-3">Jumlah Pertemuan</th>
                  <th className="px-4 py-3">Tanggal Mengajar</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">{r.pengajar}</td>
                    <td className="px-4 py-3 text-slate-600">{r.sekolah}</td>
                    <td className="px-4 py-3">{r.jumlah}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.tanggal
                        .sort()
                        .map((d) => d.slice(8, 10))
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Presensi Siswa (per kelas)
          </h2>
          <div className="space-y-5">
            {pivots.map((p) => (
              <div key={p.classLabel}>
                <p className="mb-1.5 text-sm font-medium text-gray-800">
                  {p.classLabel}
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2.5">Nama</th>
                        {p.meetingNumbers.map((n) => (
                          <th key={n} className="px-3 py-2.5 text-center">
                            P{n}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.rows.map((row) => (
                        <tr key={row.name} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                          <td className="whitespace-nowrap px-4 py-2">
                            {row.name}
                          </td>
                          {p.meetingNumbers.map((n) => (
                            <td key={n} className="px-3 py-2 text-center">
                              {row.statuses[n] ? (
                                <AttendanceBadge status={row.statuses[n]} />
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
