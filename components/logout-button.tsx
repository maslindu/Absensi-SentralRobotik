'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { btnPrimary } from '@/components/ui';

export default function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return (
    <button className={btnPrimary} onClick={handleLogout}>
      Keluar & Login Ulang
    </button>
  );
}
