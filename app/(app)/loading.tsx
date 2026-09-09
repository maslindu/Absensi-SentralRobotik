import { Loader2 } from 'lucide-react';

export default function AppLoading() {
  return (
    <div
      className="flex min-h-52 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">
        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
        Memuat halaman…
      </div>
    </div>
  );
}
