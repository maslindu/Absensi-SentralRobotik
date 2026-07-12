import { redirect } from 'next/navigation';
import { getSessionInfo } from '@/lib/auth';

// Guru mengelola halamannya; admin boleh masuk untuk membantu;
// ketua boleh membuka detail pertemuan (read-only, ditegakkan RLS).
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionInfo();
  if (!session) redirect('/login');
  return <>{children}</>;
}
