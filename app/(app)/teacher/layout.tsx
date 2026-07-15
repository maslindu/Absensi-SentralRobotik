import { redirect } from 'next/navigation';
import { getSessionInfo } from '@/lib/auth';

// Guru mengelola halamannya; admin boleh masuk untuk membantu.
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionInfo();
  if (!session) redirect('/login');
  return <>{children}</>;
}
