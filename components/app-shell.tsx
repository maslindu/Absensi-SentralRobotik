'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import {
  BarChart3,
  Bot,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  School,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { RoleName } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Label pendek khusus bottom nav mobile agar tidak terpotong. */
  short?: string;
}

const NAV_BY_ROLE: Record<RoleName, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/monitor', label: 'Pertemuan', icon: BookOpen },
    { href: '/admin/students', label: 'Siswa', icon: Users },
    { href: '/scores', label: 'Rekap Nilai', icon: ClipboardCheck, short: 'Nilai' },
    { href: '/reports', label: 'Rekap & Export', icon: BarChart3, short: 'Rekap' },
    { href: '/admin/terms', label: 'Tahun Ajaran', icon: CalendarDays },
    { href: '/admin/schools', label: 'Sekolah', icon: School },
    { href: '/admin/classes', label: 'Kelas', icon: DoorOpen },
    { href: '/admin/teachers', label: 'Guru', icon: GraduationCap },
    { href: '/admin/assignments', label: 'Penugasan', icon: ClipboardList },
  ],
  guru: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/teacher/meetings', label: 'Pertemuan Saya', icon: BookOpen, short: 'Pertemuan' },
    { href: '/teacher/students', label: 'Siswa', icon: Users },
    { href: '/scores', label: 'Rekap Nilai', icon: ClipboardCheck, short: 'Nilai' },
  ],
};

const ROLE_LABEL: Record<RoleName, string> = {
  admin: 'Admin',
  guru: 'Guru',
};

// Jumlah menu yang tampil di bottom nav mobile; sisanya masuk ke sheet "Lainnya"
// agar bottom nav tidak perlu di-scroll horizontal (sulit ditemukan di HP).
const MOBILE_NAV_LIMIT = 4;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const nav = NAV_BY_ROLE[role];
  const mobileNav = nav.slice(0, MOBILE_NAV_LIMIT);
  const overflowNav = nav.slice(MOBILE_NAV_LIMIT);

  async function handleLogout() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setSheetOpen(false);
    router.replace('/login');
    router.refresh();
  }

  function isActive(href: string) {
    return href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(href);
  }

  const termBadge = termLabel ? (
    <span className="max-w-32 truncate rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
      {termLabel}
    </span>
  ) : (
    <span className="max-w-32 truncate rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
      Belum ada term aktif
    </span>
  );

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
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur-md sm:px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-bold text-slate-900">
              Presensi Robotik
            </span>
          </div>
          <div className="hidden md:block">{termBadge}</div>
          <div className="flex items-center gap-2 md:gap-3">
            <span className="hidden sm:block md:hidden">{termBadge}</span>
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
            {/* Tombol akun mobile — jalur utama untuk logout di HP */}
            <button
              onClick={() => setSheetOpen(true)}
              aria-label="Buka menu akun"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-sm transition active:scale-95 md:hidden"
            >
              {initials(fullName) || <Users className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 px-3 py-5 pb-24 sm:px-4 sm:py-6 md:px-8 md:pb-10">
          {children}
        </main>

        {/* Bottom nav mobile — menu utama + tombol "Lainnya" */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition ${
                  active ? 'text-brand-700' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="w-full truncate text-center">
                  {item.short ?? item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setSheetOpen(true)}
            className={`flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition ${
              sheetOpen ? 'text-brand-700' : 'text-slate-500'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Lainnya</span>
          </button>
        </nav>
      </div>

      {/* Sheet akun & menu lainnya (mobile) */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Menu akun"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {initials(fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900">{fullName}</p>
                <p className="text-xs text-slate-500">{ROLE_LABEL[role]}</p>
                <div className="mt-1.5">{termBadge}</div>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {overflowNav.length > 0 && (
              <div className="p-3">
                <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Menu lainnya
                </p>
                <div className="space-y-1">
                  {overflowNav.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSheetOpen(false)}
                        className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                          active
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-700 active:bg-slate-50'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            active ? 'text-brand-600' : 'text-slate-400'
                          }`}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 p-4">
              <button
                onClick={handleLogout}
                disabled={signingOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? 'Keluar…' : 'Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
