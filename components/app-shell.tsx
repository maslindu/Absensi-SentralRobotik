'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RoleName } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_BY_ROLE: Record<RoleName, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/admin/terms', label: 'Tahun Ajaran', icon: '📅' },
    { href: '/admin/schools', label: 'Sekolah', icon: '🏫' },
    { href: '/admin/classes', label: 'Kelas', icon: '🚪' },
    { href: '/admin/teachers', label: 'Guru', icon: '🧑‍🏫' },
    { href: '/admin/students', label: 'Siswa', icon: '🎒' },
    { href: '/admin/assignments', label: 'Penugasan', icon: '📌' },
    { href: '/monitor', label: 'Pertemuan', icon: '📖' },
    { href: '/reports', label: 'Rekap', icon: '📊' },
  ],
  guru: [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/teacher/meetings', label: 'Pertemuan Saya', icon: '📖' },
    { href: '/teacher/students', label: 'Siswa', icon: '🎒' },
  ],
  ketua: [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/monitor', label: 'Monitoring', icon: '📖' },
    { href: '/reports', label: 'Rekap', icon: '📊' },
  ],
};

const ROLE_LABEL: Record<RoleName, string> = {
  admin: 'Admin',
  guru: 'Guru',
  ketua: 'Ketua',
};

export default function AppShell({
  role,
  fullName,
  termLabel,
  children,
}: {
  role: RoleName;
  fullName: string;
  termLabel: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const nav = NAV_BY_ROLE[role];

  async function handleLogout() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  function isActive(href: string) {
    return href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(href);
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <span className="text-xl">🤖</span>
          <div>
            <p className="text-sm font-bold leading-tight">
              Presensi Robotik
            </p>
            <p className="text-xs text-gray-500">Soloraya</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                isActive(item.href)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-4">
          <p className="truncate text-sm font-medium text-gray-800">
            {fullName}
          </p>
          <p className="text-xs text-gray-500">{ROLE_LABEL[role]}</p>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="mt-2 text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Keluar
          </button>
        </div>
      </aside>

      {/* Konten utama */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="text-lg">🤖</span>
            <span className="text-sm font-bold">Presensi Robotik</span>
          </div>
          <div className="flex items-center gap-3">
            {termLabel ? (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {termLabel}
              </span>
            ) : (
              <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                Belum ada term aktif
              </span>
            )}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-sm text-gray-600">{fullName}</span>
            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Keluar
            </button>
          </div>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="text-xs font-medium text-red-600 md:hidden"
          >
            Keluar
          </button>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 md:px-6 md:pb-8">
          {children}
        </main>

        {/* Bottom nav mobile */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-gray-200 bg-white md:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[72px] flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium ${
                isActive(item.href) ? 'text-blue-700' : 'text-gray-500'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
