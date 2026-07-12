import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveTerm, getSessionInfo } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { termLabel, currentMonthISO } from '@/lib/format';
import { PageHeader } from '@/components/ui';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSessionInfo();
  if (!session) redirect('/login');
  const supabase = await createClient();
  const term = await getActiveTerm();

  const month = currentMonthISO();
  const monthStart = `${month}-01`;
  const nextMonth = new Date(`${monthStart}T00:00:00`);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

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
            <Link
              href="/teacher/meetings/new"
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Buat Laporan
            </Link>
          }
        />
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          Kelas yang kamu ampu
        </h2>
        {assignments && assignments.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignments.map((a: any) => (
              <div
                key={a.id}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <p className="font-semibold text-gray-900">
                  Kelas {a.classes?.name}
                </p>
                <p className="text-sm text-gray-500">{a.schools?.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            Belum ada penugasan kelas untuk term aktif. Hubungi admin.
          </p>
        )}
      </div>
    );
  }

  // admin & ketua: kartu ringkasan
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
        <StatCard label="Sekolah aktif" value={schools.count ?? 0} />
        <StatCard label="Kelas aktif" value={classes.count ?? 0} />
        <StatCard label="Penugasan aktif" value={teachers.count ?? 0} />
        <StatCard label="Siswa aktif" value={students.count ?? 0} />
        <StatCard label="Pertemuan bulan ini" value={meetings.count ?? 0} />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/monitor"
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Lihat Pertemuan
        </Link>
        <Link
          href="/reports"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Buka Rekap
        </Link>
      </div>
    </div>
  );
}
