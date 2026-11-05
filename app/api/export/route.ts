import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { STORAGE_BUCKET, type RoleEmbed } from '@/lib/types';
import { monthRange } from '@/lib/format';

export const runtime = 'nodejs';

// Bentuk kolom hasil kueri (relasi yang di-embed PostgREST dinyatakan manual).
interface MeetingRow {
  id: string;
  meeting_date: string;
  meeting_number: number | null;
  material: string | null;
  class_id: string;
  school_id: string;
  term_id: string;
  actual_teacher: { full_name: string } | null;
  schools: { name: string } | null;
  classes: { name: string } | null;
  academic_terms: { year_label: string; semester: string } | null;
}

interface AttendanceRow {
  meeting_id: string;
  student_name_snapshot: string;
  status: string;
}

interface PhotoRow {
  meeting_id: string;
  file_path: string;
}

type SheetRow = (string | number | null)[];

// GET /api/export?month=YYYY-MM[&school_id=...]
// Membangun file .xlsx rekap bulanan (README §12) — hanya admin.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, roles:role_id(name)')
    .eq('id', user.id)
    .single<{ is_active: boolean } & RoleEmbed>();
  if (!profile?.is_active || profile.roles?.name !== 'admin') {
    return NextResponse.json(
      { error: 'Hanya admin yang boleh export' },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const month = url.searchParams.get('month'); // 'YYYY-MM'
  const schoolId = url.searchParams.get('school_id');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'Parameter month (YYYY-MM) wajib' },
      { status: 400 }
    );
  }

  const { start, end } = monthRange(month);

  const admin = createAdminClient();

  let meetingQuery = admin
    .from('meetings')
    .select(
      'id, meeting_date, meeting_number, material, class_id, school_id, term_id, ' +
        'actual_teacher:actual_teacher_id(full_name), ' +
        'schools:school_id(name), classes:class_id(name), ' +
        'academic_terms:term_id(year_label, semester)'
    )
    .gte('meeting_date', start)
    .lt('meeting_date', end)
    .order('meeting_date');
  if (schoolId) meetingQuery = meetingQuery.eq('school_id', schoolId);

  const { data: meetings, error: mErr } = await meetingQuery;
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }
  const meetingList = (meetings ?? []) as unknown as MeetingRow[];

  if (meetingList.length === 0) {
    return NextResponse.json(
      { error: 'Belum ada data untuk periode ini' },
      { status: 404 }
    );
  }

  const meetingIds = meetingList.map((m) => m.id);
  const [{ data: attendance }, { data: photos }] = await Promise.all([
    admin
      .from('attendance')
      .select('meeting_id, student_name_snapshot, status')
      .in('meeting_id', meetingIds),
    admin
      .from('meeting_photos')
      .select('meeting_id, file_path')
      .in('meeting_id', meetingIds),
  ]);

  const wb = XLSX.utils.book_new();

  // ---- Sheet 1: Rekap mengajar per guru per sekolah (query A README §12) ----
  const byTeacherSchool = new Map<
    string,
    { pengajar: string; sekolah: string; dates: string[] }
  >();
  for (const m of meetingList) {
    const key = `${m.actual_teacher?.full_name}||${m.schools?.name}`;
    const entry: { pengajar: string; sekolah: string; dates: string[] } =
      byTeacherSchool.get(key) ?? {
        pengajar: m.actual_teacher?.full_name ?? '-',
        sekolah: m.schools?.name ?? '-',
        dates: [],
      };
    entry.dates.push(m.meeting_date);
    byTeacherSchool.set(key, entry);
  }
  const rekapRows: SheetRow[] = [
    ['Pengajar', 'Sekolah', 'Jumlah Pertemuan', 'Tanggal Mengajar'],
  ];
  for (const e of byTeacherSchool.values()) {
    rekapRows.push([
      e.pengajar,
      e.sekolah,
      e.dates.length,
      e.dates.sort().join(', '),
    ]);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(rekapRows),
    'Rekap Guru'
  );

  // ---- Sheet 2: Presensi siswa pivot per kelas (query B README §12) ----
  const attRows = (attendance ?? []) as unknown as AttendanceRow[];
  const attByMeeting = new Map<string, AttendanceRow[]>();
  for (const a of attRows) {
    const arr = attByMeeting.get(a.meeting_id) ?? [];
    arr.push(a);
    attByMeeting.set(a.meeting_id, arr);
  }

  const classMeetings = new Map<string, MeetingRow[]>();
  for (const m of meetingList) {
    const key = `${m.schools?.name} — Kelas ${m.classes?.name}`;
    const arr = classMeetings.get(key) ?? [];
    arr.push(m);
    classMeetings.set(key, arr);
  }

  const pivotRows: SheetRow[] = [];
  for (const [classLabel, ms] of classMeetings) {
    const sorted = [...ms].sort(
      (a, b) => (a.meeting_number ?? 0) - (b.meeting_number ?? 0)
    );
    pivotRows.push([classLabel]);
    pivotRows.push([
      'Nama',
      ...sorted.map((m) => `P${m.meeting_number}`),
    ]);
    const students = new Map<string, Record<string, string>>();
    for (const m of sorted) {
      for (const a of attByMeeting.get(m.id) ?? []) {
        const row = students.get(a.student_name_snapshot) ?? {};
        row[`P${m.meeting_number}`] = a.status;
        students.set(a.student_name_snapshot, row);
      }
    }
    for (const name of [...students.keys()].sort()) {
      const row = students.get(name)!;
      pivotRows.push([
        name,
        ...sorted.map((m) => row[`P${m.meeting_number}`] ?? ''),
      ]);
    }
    pivotRows.push([]); // pemisah antar kelas
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(pivotRows),
    'Presensi Siswa'
  );

  // ---- Sheet 3: Materi ----
  const materiRows: SheetRow[] = [
    ['Tanggal', 'Guru', 'Sekolah', 'Kelas', 'Pertemuan ke-', 'Materi'],
  ];
  for (const m of meetingList) {
    materiRows.push([
      m.meeting_date,
      m.actual_teacher?.full_name ?? '-',
      m.schools?.name ?? '-',
      m.classes?.name ?? '-',
      m.meeting_number,
      m.material ?? '',
    ]);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(materiRows),
    'Materi'
  );

  // ---- Sheet 4: Dokumentasi (signed URL 7 hari) ----
  const meetingById = new Map(meetingList.map((m) => [m.id, m]));
  const dokRows: SheetRow[] = [
    ['Tanggal', 'Guru', 'Sekolah', 'Kelas', 'Link Foto'],
  ];
  for (const p of (photos ?? []) as unknown as PhotoRow[]) {
    const m = meetingById.get(p.meeting_id);
    if (!m) continue;
    const { data: signed } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(p.file_path, 60 * 60 * 24 * 7);
    dokRows.push([
      m.meeting_date,
      m.actual_teacher?.full_name ?? '-',
      m.schools?.name ?? '-',
      m.classes?.name ?? '-',
      signed?.signedUrl ?? '(gagal membuat link)',
    ]);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(dokRows),
    'Dokumentasi'
  );

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // catat audit export
  await admin.from('export_logs').insert({
    period: month,
    status: 'success',
    exported_by: user.id,
    notes: schoolId ? `filter sekolah: ${schoolId}` : null,
  });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="presensi-robotik-${month}.xlsx"`,
    },
  });
}
