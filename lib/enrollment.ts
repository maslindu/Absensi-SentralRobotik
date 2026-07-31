import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pastikan enrollment siswa sudah mencakup tanggal pertemuan.
 *
 * Kasus nyata: siswa didaftarkan hari ini (start_date = hari ini), lalu guru
 * mengisi laporan pertemuan minggu lalu yang terlewat. Tanpa ini, siswa
 * tersebut dianggap "belum bergabung" pada tanggal itu sehingga tidak
 * ter-seed ke presensi. Karena guru menyatakan siswa tersebut ikut pertemuan
 * itu, tanggal mulai enrollment ditarik ke belakang (backdate).
 *
 * Enrollment yang sudah ditutup (end_date) sebelum tanggal pertemuan TIDAK
 * diubah — siswa yang sudah keluar tetap dihitung keluar.
 *
 * Panggil SEBELUM insert meetings agar trigger `seed_attendance` di database
 * melihat enrollment yang sudah dibetulkan.
 */
export async function backdateEnrollments(
  supabase: SupabaseClient,
  params: {
    studentIds: string[];
    classId: string;
    termId: string;
    date: string; // YYYY-MM-DD
  }
): Promise<void> {
  const { studentIds, classId, termId, date } = params;
  if (studentIds.length === 0) return;

  const { data } = await supabase
    .from('enrollments')
    .select('id')
    .eq('class_id', classId)
    .eq('term_id', termId)
    .in('student_id', studentIds)
    .gt('start_date', date);

  const ids = ((data as { id: string }[]) ?? []).map((r) => r.id);
  if (ids.length === 0) return;

  await supabase
    .from('enrollments')
    .update({ start_date: date })
    .in('id', ids);
}
