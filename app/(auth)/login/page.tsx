'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Field, Spinner, btnPrimary, inputCls } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError('Email atau password salah');
      setLoading(false);
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-brand-100 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/60">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/25">
            <Bot className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Presensi Robotik</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sentral Robotik — masuk untuk mencatat &amp; memantau kegiatan
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" required>
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password" required>
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={`${btnPrimary} w-full`}
            disabled={loading}
          >
            {loading && <Spinner className="h-4 w-4" />} Masuk
          </button>
        </form>
      </div>
    </div>
  );
}
