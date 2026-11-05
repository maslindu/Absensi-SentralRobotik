import { redirect } from 'next/navigation';
import { getSessionInfo } from '@/lib/auth';

// Rekap nilai dibuka untuk admin (semua kelas) maupun guru. Cakupan data
// dibatasi RLS, bukan oleh gerbang halaman ini.
export default async function ScoresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionInfo();
  if (!session) redirect('/login');
  return <>{children}</>;
}
