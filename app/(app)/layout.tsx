import { redirect } from 'next/navigation';
import AppShell from '@/components/app-shell';
import LogoutButton from '@/components/logout-button';
import { getActiveTerm, getSessionInfo } from '@/lib/auth';
import { termLabel } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionInfo();
  if (!session) {
    // Bedakan: belum login (ke /login) vs login tapi profil tidak
    // ada/nonaktif (tampilkan pesan — hindari redirect loop dengan proxy).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-gray-900">
          Akun belum aktif
        </p>
        <p className="max-w-sm text-sm text-gray-500">
          Akunmu belum memiliki profil atau sudah dinonaktifkan. Hubungi admin
          komunitas untuk mengaktifkan.
        </p>
        <LogoutButton />
      </div>
    );
  }

  const term = await getActiveTerm();

  return (
    <AppShell
      role={session.role}
      fullName={session.profile.full_name}
      termLabel={term ? termLabel(term) : null}
    >
      {children}
    </AppShell>
  );
}
