// Utilitas import/template Excel untuk data siswa.
// Dipakai bersama oleh halaman admin & guru agar format konsisten.
import * as XLSX from 'xlsx';

export interface ParsedStudentRow {
  full_name: string;
  nis: string | null;
}

export interface ParseResult {
  rows: ParsedStudentRow[];
  skipped: number; // baris kosong / judul yang dilewati
}

/**
 * Membaca file Excel siswa. Konvensi kolom:
 *   Kolom A = Nama Lengkap (wajib)
 *   Kolom B = NIS (opsional)
 * Baris judul ("Nama"/"Nama Lengkap") & baris kosong otomatis dilewati.
 */
export async function parseStudentSheet(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const rows: ParsedStudentRow[] = [];
  let total = 0;
  for (const row of raw) {
    const cells = row as unknown[];
    const name = String(cells?.[0] ?? '').trim();
    if (!name) continue; // baris kosong
    total++;
    // lewati baris header ("Nama" / "Nama Lengkap")
    if (/^nama(\s+lengkap)?$/i.test(name)) continue;
    const nis = String(cells?.[1] ?? '').trim();
    rows.push({ full_name: name, nis: nis || null });
  }

  return { rows, skipped: total - rows.length };
}

/**
 * Membuat & mengunduh file template .xlsx untuk import siswa.
 * Berisi baris judul + contoh agar admin/guru paham formatnya.
 */
export function downloadStudentTemplate() {
  const aoa = [
    ['Nama Lengkap', 'NIS'],
    ['Budi Santoso', '2025001'],
    ['Siti Aminah', '2025002'],
    ['Andi Wijaya', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 32 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Siswa');
  XLSX.writeFile(wb, 'template-import-siswa.xlsx');
}
