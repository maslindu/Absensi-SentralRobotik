import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  DoorOpen,
  Plus,
  School,
  Users,
} from 'lucide-react';
import { getActiveTerm, getSessionInfo } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { termLabel, currentMonthISO, monthRange } from '@/lib/format';
import { PageHeader, btnPrimary, btnSecondary } from '@/components/ui';

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSessionInfo();
  if (!session) redirect('/login');
  const supabase = await createClient();
  const term = await getActiveTerm();

  const month = currentMonthISO();
  const { start: monthStart, end: monthEnd } = monthRange(month);

  if (session.role === 'guru') {
    const { data: assignments } = term
      ? await supabase
          .from('teacher_assignments')
          .select('id, classes:class_id(id, name), schools:school_id(id, name)')
          .eq('teacher_id', session.userId)
          .eq('term_id', term.id)
          .eq('is_active', true)
      : { data: [] };

    return (
      <div>
        <PageHeader
          title={`Halo, ${session.profile.full_name}`}
          subtitle={
            term
              ? `Term aktif: ${termLabel(term)}`
              : 'Belum ada tahun ajaran aktif — hubungi admin.'
          }
          action={
            <Link href="/teacher/meetings/new" className={btnPrimary}>
              <Plus className="h-4 w-4" /> Buat Laporan
            </Link>
          }
        />
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Kelas yang kamu ampu
        </h2>
        {assignments && assignments.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignments.map((a: any) => (
              <div key={a.id} className="card p-4">
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <DoorOpen className="h-4.5 w-4.5" />
                </div>
                <p className="font-semibold text-slate-900">
                  Kelas {a.classes?.name}
                </p>
                <p className="text-sm text-slate-500">{a.schools?.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Belum ada penugasan kelas untuk term aktif. Hubungi admin.
          </p>
        )}
      </div>
    );
  }

  // admin: kartu ringkasan
  const [schools, classes, teachers, students, meetings] = await Promise.all([
    supabase
      .from('schools')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('teacher_assignments')
      .select('teacher_id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aktif'),
    supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .gte('meeting_date', monthStart)
      .lt('meeting_date', monthEnd),
  ]);

  return (
    <div>
      <PageHeader
        title={`Halo, ${session.profile.full_name}`}
        subtitle={
          term
            ? `Term aktif: ${termLabel(term)}`
            : 'Belum ada tahun ajaran aktif.'
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Sekolah aktif"
          value={schools.count ?? 0}
          icon={<School className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Kelas aktif"
          value={classes.count ?? 0}
          icon={<DoorOpen className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Penugasan aktif"
          value={teachers.count ?? 0}
          icon={<CalendarDays className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Siswa aktif"
          value={students.count ?? 0}
          icon={<Users className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Pertemuan bulan ini"
          value={meetings.count ?? 0}
          icon={<BookOpen className="h-4.5 w-4.5" />}
        />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/monitor" className={btnPrimary}>
          <BookOpen className="h-4 w-4" /> Lihat Pertemuan
        </Link>
        <Link href="/reports" className={btnSecondary}>
          <BarChart3 className="h-4 w-4" /> Buka Rekap
        </Link>
      </div>
    </div>
  );
}
