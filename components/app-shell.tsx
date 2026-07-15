'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import {
  BarChart3,
  Bot,
  BookOpen,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  School,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { RoleName } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_BY_ROLE: Record<RoleName, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/terms', label: 'Tahun Ajaran', icon: CalendarDays },
    { href: '/admin/schools', label: 'Sekolah', icon: School },
    { href: '/admin/classes', label: 'Kelas', icon: DoorOpen },
    { href: '/admin/teachers', label: 'Guru', icon: GraduationCap },
    { href: '/admin/students', label: 'Siswa', icon: Users },
    { href: '/admin/assignments', label: 'Penugasan', icon: ClipboardList },
    { href: '/monitor', label: 'Pertemuan', icon: BookOpen },
    { href: '/reports', label: 'Rekap', icon: BarChart3 },
  ],
  guru: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/teacher/meetings', label: 'Pertemuan Saya', icon: BookOpen },
    { href: '/teacher/students', label: 'Siswa', icon: Users },
  ],
};

const ROLE_LABEL: Record<RoleName, string> = {
  admin: 'Admin',
  guru: 'Guru',
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Bot className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900">Presensi Robotik</p>
            <p className="text-xs text-slate-500">Sentral Robotik</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4.5 w-4.5 ${
                    active ? 'text-brand-600' : 'text-slate-400'
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <p className="truncate text-sm font-semibold text-slate-800">
            {fullName}
          </p>
          <p className="text-xs text-slate-500">{ROLE_LABEL[role]}</p>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* Konten utama */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-slate-900">
              Presensi Robotik
            </span>
          </div>
          <div className="hidden md:block">
            {termLabel ? (
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                {termLabel}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Belum ada term aktif
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {termLabel ? (
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 md:hidden">
                {termLabel}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 md:hidden">
                Belum ada term
              </span>
            )}
            <span className="hidden text-sm text-slate-600 md:inline">
              {fullName}
            </span>
            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 md:inline-flex"
            >
              <LogOut className="h-3.5 w-3.5" /> Keluar
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-10">
          {children}
        </main>

        {/* Bottom nav mobile */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-medium transition ${
                  active ? 'text-brand-700' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
