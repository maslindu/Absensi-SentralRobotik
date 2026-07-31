// Utilitas format tanggal & label Bahasa Indonesia
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Zona waktu acuan aplikasi. Dipakai agar "hari ini" sama baik dihitung di
// browser guru maupun di server (Vercel/Node biasanya berjalan pada UTC).
export const APP_TIME_ZONE = 'Asia/Jakarta';

export function todayISO(): string {
  // en-CA menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function currentMonthISO(): string {
  return todayISO().slice(0, 7); // 'YYYY-MM'
}

/**
 * Rentang tanggal satu bulan untuk filter `meeting_date`:
 * `start` inklusif, `end` eksklusif (tanggal 1 bulan berikutnya).
 *
 * Dihitung murni dari string — JANGAN pakai `new Date(...).toISOString()`
 * karena konversi ke UTC menggeser tanggal 1 hari di zona waktu +7,
 * sehingga pertemuan di hari terakhir bulan ikut terpotong.
 */
export function monthRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number);
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  return {
    start: `${month}-01`,
    end: `${nextYear}-${String(nextMon).padStart(2, '0')}-01`,
  };
}

export function termLabel(t: {
  year_label: string;
  semester: string;
}): string {
  return `${t.year_label} ${t.semester === 'ganjil' ? 'Ganjil' : 'Genap'}`;
}

export const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
