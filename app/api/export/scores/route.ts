import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { getSessionInfo } from '@/lib/auth';
import { PROGRESS_LABEL, type ProgressLevel } from '@/lib/types';
import { termLabel } from '@/lib/format';

export const runtime = 'nodejs';

// GET /api/export/scores?term_id=...[&school_id=...][&class_id=...]
// Rekap nilai & progres siswa SATU SEMESTER penuh, per kelas.
//
// Berbeda dari /api/export (rekap bulanan, admin-only, pakai service role):
// handler ini sengaja memakai klien milik user agar RLS yang membatasi
// cakupannya. Admin melihat semua kelas; guru hanya kelas yang ia ampu —
// tanpa perlu pengecekan penugasan manual di sini.
type MeetingRow = {
  id: string;
  meeting_number: number | null;
  meeting_date: string;
  class_id: string;
  school_id: string;
  classes: { name: string } | null;
  schools: { name: string } | null;
};

type AttendanceRow = {
  meeting_id: string;
  student_name_snapshot: string;
  status: string;
  score: number | null;
  progress: ProgressLevel | null;
};

export async function GET(request: Request) {
  const session = await getSessionInfo();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const url = new URL(request.url);
  const termId = url.searchParams.get('term_id');
  const schoolId = url.searchParams.get('school_id');
  const classId = url.searchParams.get('class_id');
  if (!termId) {
    return NextResponse.json(
      { error: 'Parameter term_id wajib' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: term } = await supabase
    .from('academic_terms')
    .select('year_label, semester')
    .eq('id', termId)
    .maybeSingle();

  let meetingQuery = supabase
    .from('meetings')
    .select(
      'id, meeting_number, meeting_date, class_id, school_id, ' +
        'classes:class_id(name), schools:school_id(name)'
    )
    .eq('term_id', termId)
    .order('meeting_number');
  if (classId) meetingQuery = meetingQuery.eq('class_id', classId);
  else if (schoolId) meetingQuery = meetingQuery.eq('school_id', schoolId);

  const { data: meetings, error: mErr } = await meetingQuery;
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }
  const meetingList = (meetings ?? []) as unknown as MeetingRow[];
  if (meetingList.length === 0) {
    return NextResponse.json(
      { error: 'Belum ada pertemuan pada cakupan ini' },
      { status: 404 }
    );
  }

  const { data: attendance, error: aErr } = await supabase
    .from('attendance')
    .select('meeting_id, student_name_snapshot, status, score, progress')
    .in(
      'meeting_id',
      meetingList.map((m) => m.id)
    );
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }
  const attRows = (attendance ?? []) as unknown as AttendanceRow[];

  const attByMeeting = new Map<string, AttendanceRow[]>();
  for (const a of attRows) {
    const arr = attByMeeting.get(a.meeting_id) ?? [];
    arr.push(a);
    attByMeeting.set(a.meeting_id, arr);
  }

  // Kelompokkan pertemuan per kelas, urut nomor pertemuan.
  const byClass = new Map<string, MeetingRow[]>();
  for (const m of meetingList) {
    const arr = byClass.get(m.class_id) ?? [];
    arr.push(m);
    byClass.set(m.class_id, arr);
  }

  const classBlocks = [...byClass.entries()]
    .map(([id, ms]) => ({
      id,
      school: ms[0].schools?.name ?? '-',
      kelas: ms[0].classes?.name ?? '-',
      meetings: [...ms].sort(
        (a, b) => (a.meeting_number ?? 0) - (b.meeting_number ?? 0)
      ),
    }))
    .sort((a, b) =>
      (a.school + ' ' + a.kelas).localeCompare(b.school + ' ' + b.kelas, 'id')
    );

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const wb = XLSX.utils.book_new();
  const nilaiRows: unknown[][] = [];
  const progresRows: unknown[][] = [];
  const ringkasanRows: unknown[][] = [
    [
      'Sekolah',
      'Kelas',
      'Nama',
      'Pertemuan Diikuti',
      'Hadir',
      'Izin',
      'Sakit',
      'Alpa',
      'Jumlah Dinilai',
      'Rata-rata Nilai',
      'Nilai Tertinggi',
      'Nilai Terendah',
      'Progres Terakhir',
    ],
  ];

  for (const block of classBlocks) {
    const label = block.school + ' — Kelas ' + block.kelas;
    const numbers = block.meetings.map((m) => 'P' + (m.meeting_number ?? '?'));

    // nama siswa -> data per pertemuan
    const perStudent = new Map<
      string,
      { score: (number | null)[]; progress: (ProgressLevel | null)[]; status: string[] }
    >();
    block.meetings.forEach((m, idx) => {
      for (const a of attByMeeting.get(m.id) ?? []) {
        const entry =
          perStudent.get(a.student_name_snapshot) ??
          {
            score: Array(block.meetings.length).fill(null),
            progress: Array(block.meetings.length).fill(null),
            status: Array(block.meetings.length).fill(''),
          };
        entry.score[idx] = a.score;
        entry.progress[idx] = a.progress;
        entry.status[idx] = a.status;
        perStudent.set(a.student_name_snapshot, entry);
      }
    });

    const names = [...perStudent.keys()].sort((a, b) => a.localeCompare(b, 'id'));

    nilaiRows.push([label]);
    nilaiRows.push(['Nama', ...numbers, 'Rata-rata']);
    progresRows.push([label]);
    progresRows.push(['Nama', ...numbers]);

    for (const name of names) {
      const entry = perStudent.get(name)!;
      const scored = entry.score.filter((s): s is number => s !== null);
      const avg =
        scored.length > 0
          ? round2(scored.reduce((t, s) => t + s, 0) / scored.length)
          : '';

      nilaiRows.push([
        name,
        ...entry.score.map((s) => (s === null ? '' : s)),
        avg,
      ]);
      progresRows.push([
        name,
        ...entry.progress.map((p) => (p ? PROGRESS_LABEL[p] : '')),
      ]);

      const lastProgress = [...entry.progress].reverse().find((p) => p);
      const countStatus = (st: string) =>
        entry.status.filter((s) => s === st).length;

      ringkasanRows.push([
        block.school,
        block.kelas,
        name,
        entry.status.filter((s) => s !== '').length,
        countStatus('hadir'),
        countStatus('izin'),
        countStatus('sakit'),
        countStatus('alpa'),
        scored.length,
        avg,
        scored.length > 0 ? Math.max(...scored) : '',
        scored.length > 0 ? Math.min(...scored) : '',
        lastProgress ? PROGRESS_LABEL[lastProgress] : '',
      ]);
    }

    nilaiRows.push([]);
    progresRows.push([]);
  }

  const ringkasanSheet = XLSX.utils.aoa_to_sheet(ringkasanRows);
  ringkasanSheet['!cols'] = [
    { wch: 24 },
    { wch: 10 },
    { wch: 28 },
    { wch: 18 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ringkasanSheet, 'Ringkasan');

  const nilaiSheet = XLSX.utils.aoa_to_sheet(nilaiRows);
  nilaiSheet['!cols'] = [{ wch: 28 }];
  XLSX.utils.book_append_sheet(wb, nilaiSheet, 'Nilai per Pertemuan');

  const progresSheet = XLSX.utils.aoa_to_sheet(progresRows);
  progresSheet['!cols'] = [{ wch: 28 }];
  XLSX.utils.book_append_sheet(wb, progresSheet, 'Progres per Pertemuan');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const scopeName =
    classBlocks.length === 1
      ? slug(classBlocks[0].school + '-kelas-' + classBlocks[0].kelas)
      : schoolId
        ? slug(classBlocks[0]?.school ?? 'sekolah')
        : 'semua-kelas';
  const periode = term ? slug(termLabel(term)) : termId;
  const filename = `rekap-nilai-${scopeName}-${periode}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
