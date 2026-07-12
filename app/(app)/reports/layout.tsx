import { redirect } from 'next/navigation';
import { getSessionInfo } from '@/lib/auth';

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionInfo();
  if (!session || (session.role !== 'ketua' && session.role !== 'admin'))
    redirect('/dashboard');
  return <>{children}</>;
}
