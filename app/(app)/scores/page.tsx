'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type {
  AcademicTerm,
  Class,
  ProgressLevel,
  RoleName,
  School,
  TeacherAssignment,
} from '@/lib/types';
import { PROGRESS_LABEL } from '@/lib/types';
import { termLabel } from '@/lib/format';
import {
  EmptyState,
  LoadingState,
  PageHeader,
  Spinner,
  btnPrimary,
  inputCls,
} from '@/components/ui';

interface MeetingLite {
  id: string;
  meeting_number: number | null;
  meeting_date: string;
  class_id: string;
  school_id: string;
  classes: { name: string } | null;
  schools: { name: string } | null;
}

interface StudentScoreRow {
  name: string;
  scores: (number | null)[];
  progress: (ProgressLevel | null)[];
  average: number | null;
}

interface ClassScoreBlock {
  classId: string;
  label: string;
  meetingNumbers: (number | null)[];
  rows: StudentScoreRow[];
}

const PROGRESS_CHIP: Record<ProgressLevel, string> = {
  berkembang: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cukup: 'bg-amber-50 text-amber-700 ring-amber-200',
  belum: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function ScoresPage() {
  const supabase = createClient();
  const toast = useToast();

  const [role, setRole] = useState<RoleName | null>(null);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [termId, setTermId] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [schoolFilter, setSchoolFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [blocks, setBlocks] = useState<ClassScoreBlock[]>([]);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Role + daftar semester (sekali saat halaman dibuka).
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: profile }, { data: termData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('roles:role_id(name)')
          .eq('id', user.id)
          .single(),
        supabase
          .from('academic_terms')
          .select('*')
          .order('year_label', { ascending: false }),
      ]);
      const roles = profile?.roles as { name?: string } | null;
      setRole((roles?.name ?? 'guru') as RoleName);
      const list = (termData as AcademicTerm[]) ?? [];
      setTerms(list);
      setTermId(list.find((t) => t.is_active)?.id ?? list[0]?.id ?? '');
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cakupan sekolah & kelas: admin melihat semuanya, guru hanya yang diampu
  // pada semester terpilih.
  const loadScope = useCallback(async () => {
    if (!role || !termId) return;
    if (role === 'admin') {
      const [{ data: sch }, { data: cls }] = await Promise.all([
        supabase.from('schools').select('*').eq('is_active', true).order('name'),
        supabase
          .from('classes')
          .select('*, schools:school_id(id, name)')
          .eq('is_active', true)
          .order('name'),
      ]);
      setSchools((sch as School[]) ?? []);
      setClasses((cls as Class[]) ?? []);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: asg } = await supabase
      .from('teacher_assignments')
      .select('*, schools:school_id(id, name), classes:class_id(id, name)')
      .eq('teacher_id', user.id)
      .eq('term_id', termId)
      .eq('is_active', true);
    const list = (asg as TeacherAssignment[]) ?? [];
    const schoolMap = new Map<string, School>();
    const classList: Class[] = [];
    for (const a of list) {
      if (a.schools) schoolMap.set(a.school_id, a.schools);
      if (a.classes)
        classList.push({ ...a.classes, school_id: a.school_id } as Class);
    }
    setSchools(
      [...schoolMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'))
    );
    setClasses(
      classList.sort((a, b) => a.name.localeCompare(b.name, 'id'))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, termId]);

  useEffect(() => {
    loadScope();
  }, [loadScope]);

  const classesOfSchool = useMemo(
    () => classes.filter((c) => c.school_id === schoolFilter),
    [classes, schoolFilter]
  );

  // Rekap: pertemuan satu semester + presensinya, lalu dipivot per kelas.
  const loadScores = useCallback(async () => {
    if (!termId || !schoolFilter) {
      setBlocks([]);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('meetings')
      .select(
        'id, meeting_number, meeting_date, class_id, school_id, classes:class_id(name), schools:school_id(name)'
      )
      .eq('term_id', termId)
      .order('meeting_number');
    if (classFilter) q = q.eq('class_id', classFilter);
    else q = q.eq('school_id', schoolFilter);

    const { data: meetingData, error } = await q;
    if (error) {
      toast('Gagal memuat rekap: ' + error.message, 'error');
      setLoading(false);
      return;
    }
    const meetings = (meetingData as unknown as MeetingLite[]) ?? [];
    if (meetings.length === 0) {
      setBlocks([]);
      setLoading(false);
      return;
    }

    const { data: attData, error: attErr } = await supabase
      .from('attendance')
      .select('meeting_id, student_name_snapshot, score, progress')
      .in(
        'meeting_id',
        meetings.map((m) => m.id)
      );
    if (attErr) {
      toast('Gagal memuat nilai: ' + attErr.message, 'error');
      setLoading(false);
      return;
    }
    const attRows = (attData ?? []) as {
      meeting_id: string;
      student_name_snapshot: string;
      score: number | null;
      progress: ProgressLevel | null;
    }[];
    const attByMeeting = new Map<string, typeof attRows>();
    for (const a of attRows) {
      const arr = attByMeeting.get(a.meeting_id) ?? [];
      arr.push(a);
      attByMeeting.set(a.meeting_id, arr);
    }

    const byClass = new Map<string, MeetingLite[]>();
    for (const m of meetings) {
      const arr = byClass.get(m.class_id) ?? [];
      arr.push(m);
      byClass.set(m.class_id, arr);
    }

    const result: ClassScoreBlock[] = [];
    for (const [classId, ms] of byClass) {
      const sorted = [...ms].sort(
        (a, b) => (a.meeting_number ?? 0) - (b.meeting_number ?? 0)
      );
      const perStudent = new Map<
        string,
        { scores: (number | null)[]; progress: (ProgressLevel | null)[] }
      >();
      sorted.forEach((m, idx) => {
        for (const a of attByMeeting.get(m.id) ?? []) {
          const entry =
            perStudent.get(a.student_name_snapshot) ?? {
              scores: Array(sorted.length).fill(null),
              progress: Array(sorted.length).fill(null),
            };
          entry.scores[idx] = a.score;
          entry.progress[idx] = a.progress;
          perStudent.set(a.student_name_snapshot, entry);
        }
      });

      result.push({
        classId,
        label:
          (sorted[0].schools?.name ?? '-') +
          ' — Kelas ' +
          (sorted[0].classes?.name ?? '-'),
        meetingNumbers: sorted.map((m) => m.meeting_number),
        rows: [...perStudent.keys()]
          .sort((a, b) => a.localeCompare(b, 'id'))
          .map((name) => {
            const entry = perStudent.get(name)!;
            const scored = entry.scores.filter((s): s is number => s !== null);
            return {
              name,
              scores: entry.scores,
              progress: entry.progress,
              average:
                scored.length > 0
                  ? Math.round(
                      (scored.reduce((t, s) => t + s, 0) / scored.length) * 100
                    ) / 100
                  : null,
            };
          }),
      });
    }
    setBlocks(
      result.sort((a, b) => a.label.localeCompare(b.label, 'id'))
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, schoolFilter, classFilter]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  async function download() {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ term_id: termId });
      if (classFilter) params.set('class_id', classFilter);
      else if (schoolFilter) params.set('school_id', schoolFilter);
      const res = await fetch('/api/export/scores?' + params.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast(json?.error ?? 'Gagal mengunduh rekap', 'error');
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download =
        res.headers
          .get('Content-Disposition')
          ?.match(/filename="(.+)"/)?.[1] ?? 'rekap-nilai.xlsx';
      a.click();
      URL.revokeObjectURL(href);
      toast('Rekap nilai berhasil diunduh');
    } finally {
      setDownloading(false);
    }
  }

  if (booting) return <LoadingState />;

  const totalStudents = blocks.reduce((n, b) => n + b.rows.length, 0);

  return (
    <div>
      <PageHeader
        title="Rekap Nilai"
        subtitle="Nilai & progres siswa sepanjang satu semester — siap diunduh"
        action={
          <button
            className={btnPrimary}
            onClick={download}
            disabled={downloading || blocks.length === 0}
          >
            {downloading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Unduh Rekap (.xlsx)
          </button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <select
          aria-label="Pilih semester"
          className={inputCls}
          value={termId}
          onChange={(e) => {
            setTermId(e.target.value);
            setSchoolFilter('');
            setClassFilter('');
          }}
        >
          {terms.length === 0 && <option value="">— belum ada semester —</option>}
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {termLabel(t)}
              {t.is_active ? ' (aktif)' : ''}
            </option>
          ))}
        </select>
        <select
          aria-label="Pilih sekolah"
          className={inputCls}
          value={schoolFilter}
          onChange={(e) => {
            setSchoolFilter(e.target.value);
            setClassFilter('');
          }}
        >
          <option value="">Pilih sekolah</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Pilih kelas"
          className={inputCls}
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          disabled={!schoolFilter}
        >
          <option value="">Semua kelas di sekolah ini</option>
          {classesOfSchool.map((c) => (
            <option key={c.id} value={c.id}>
              Kelas {c.name}
            </option>
          ))}
        </select>
      </div>

      {!schoolFilter ? (
        <EmptyState
          title="Pilih sekolah"
          hint="Rekap nilai seluruh kelas di sekolah itu akan ditampilkan, dan bisa langsung diunduh."
          icon={<ClipboardCheck className="h-6 w-6" />}
        />
      ) : loading ? (
        <LoadingState text="Menghitung rekap…" />
      ) : blocks.length === 0 ? (
        <EmptyState
          title="Belum ada pertemuan pada semester ini"
          hint="Rekap nilai muncul setelah ada pertemuan yang tercatat. Nilai diisi dari layar presensi tiap pertemuan."
          icon={<ClipboardCheck className="h-6 w-6" />}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {totalStudents} siswa di {blocks.length} kelas · angka = nilai
            pertemuan, chip = progres
          </p>
          <div className="space-y-6">
            {blocks.map((block) => (
              <div key={block.classId}>
                <p className="mb-1.5 text-sm font-semibold text-slate-800">
                  {block.label}
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5">
                          Nama
                        </th>
                        {block.meetingNumbers.map((n, i) => (
                          <th
                            key={String(n) + '-' + i}
                            className="px-3 py-2.5 text-center"
                          >
                            P{n ?? '?'}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-center">Rata-rata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row) => (
                        <tr
                          key={row.name}
                          className="border-b border-slate-50 transition-colors hover:bg-slate-50/50"
                        >
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium">
                            {row.name}
                          </td>
                          {row.scores.map((score, i) => {
                            const progress = row.progress[i];
                            return (
                              <td
                                key={i}
                                className="px-3 py-2 text-center align-middle"
                              >
                                {score === null && !progress ? (
                                  <span className="text-slate-300">—</span>
                                ) : (
                                  <div className="flex flex-col items-center gap-0.5">
                                    {score !== null && (
                                      <span className="font-semibold text-slate-800">
                                        {score}
                                      </span>
                                    )}
                                    {progress && (
                                      <span
                                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${PROGRESS_CHIP[progress]}`}
                                      >
                                        {PROGRESS_LABEL[progress]}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center font-bold text-brand-700">
                            {row.average ?? '—'}
                          </td>
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
