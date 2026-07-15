'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Plus, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type {
  AcademicTerm,
  Class,
  Enrollment,
  Student,
} from '@/lib/types';
import { formatDateShort, termLabel, todayISO } from '@/lib/format';
import {
  ActiveBadge,
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Spinner,
  btnPrimary,
  btnSecondary,
  btnSmall,
  inputCls,
} from '@/components/ui';

interface StudentForm {
  id?: string;
  full_name: string;
  nis: string;
  gender: string;
  status: 'aktif' | 'nonaktif';
}

const emptyStudent: StudentForm = {
  full_name: '',
  nis: '',
  gender: '',
  status: 'aktif',
};

export default function AdminStudentsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [studentModal, setStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudent);
  const [saving, setSaving] = useState(false);

  // panel enrollment
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [newEnroll, setNewEnroll] = useState({
    class_id: '',
    term_id: '',
    start_date: todayISO(),
  });
  const [toDelete, setToDelete] = useState<Enrollment | null>(null);

  // import excel
  const [importOpen, setImportOpen] = useState(false);
  const [importClassId, setImportClassId] = useState('');
  const [importTermId, setImportTermId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [st, cls, tm] = await Promise.all([
      supabase.from('students').select('*').order('full_name'),
      supabase
        .from('classes')
        .select('*, schools:school_id(id, name)')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('academic_terms')
        .select('*')
        .order('year_label', { ascending: false }),
    ]);
    if (st.error) toast('Gagal memuat data: ' + st.error.message, 'error');
    setStudents((st.data as Student[]) ?? []);
    setClasses((cls.data as Class[]) ?? []);
    setTerms((tm.data as AcademicTerm[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.nis ?? '').includes(search)
  );

  async function saveStudent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      full_name: studentForm.full_name.trim(),
      nis: studentForm.nis.trim() || null,
      gender: studentForm.gender || null,
      status: studentForm.status,
    };
    const { error } = studentForm.id
      ? await supabase
          .from('students')
          .update(payload)
          .eq('id', studentForm.id)
      : await supabase.from('students').insert(payload);
    setSaving(false);
    if (error) {
      toast('Gagal menyimpan: ' + error.message, 'error');
      return;
    }
    toast('Siswa tersimpan');
    setStudentModal(false);
    load();
  }

  async function loadEnrollments(student: Student) {
    setEnrollStudent(student);
    setEnrollLoading(true);
    const activeTerm = terms.find((t) => t.is_active);
    setNewEnroll({
      class_id: '',
      term_id: activeTerm?.id ?? '',
      start_date: todayISO(),
    });
    const { data, error } = await supabase
      .from('enrollments')
      .select(
        '*, classes:class_id(id, name, schools:school_id(id, name)), academic_terms:term_id(id, year_label, semester)'
      )
      .eq('student_id', student.id)
      .order('created_at', { ascending: false });
    if (error) toast('Gagal memuat enrollment: ' + error.message, 'error');
    setEnrollments((data as Enrollment[]) ?? []);
    setEnrollLoading(false);
  }

  async function addEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollStudent) return;
    setSaving(true);
    const { error } = await supabase.from('enrollments').insert({
      student_id: enrollStudent.id,
      class_id: newEnroll.class_id,
      term_id: newEnroll.term_id,
      start_date: newEnroll.start_date,
    });
    setSaving(false);
    if (error) {
      toast(
        error.code === '23505'
          ? 'Siswa sudah terdaftar di kelas & semester ini'
          : 'Gagal menambah enrollment: ' + error.message,
        'error'
      );
      return;
    }
    toast('Siswa didaftarkan ke kelas');
    loadEnrollments(enrollStudent);
  }

  async function endEnrollment(en: Enrollment) {
    const { error } = await supabase
      .from('enrollments')
      .update({ end_date: todayISO(), is_active: false })
      .eq('id', en.id);
    if (error) {
      toast('Gagal mengeluarkan siswa: ' + error.message, 'error');
      return;
    }
    toast('Siswa dikeluarkan dari kelas (histori tetap tersimpan)');
    if (enrollStudent) loadEnrollments(enrollStudent);
  }

  async function deleteEnrollment(en: Enrollment) {
    const { error } = await supabase
      .from('enrollments')
      .delete()
      .eq('id', en.id);
    setToDelete(null);
    if (error) {
      toast(
        'Tidak bisa menghapus (ada histori presensi terkait): ' +
          error.message,
        'error'
      );
      return;
    }
    toast('Enrollment dihapus');
    if (enrollStudent) loadEnrollments(enrollStudent);
  }

  function openImport() {
    const activeTerm = terms.find((t) => t.is_active);
    setImportClassId('');
    setImportTermId(activeTerm?.id ?? '');
    setImportResult(null);
    setImportOpen(true);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!importClassId || !importTermId) {
      toast('Pilih kelas & semester terlebih dahulu', 'error');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

      // parse baris → {nama, nis}, lewati header & baris kosong
      const parsed: { full_name: string; nis: string | null }[] = [];
      for (const row of rows) {
        const name = String(row?.[0] ?? '').trim();
        if (!name) continue;
        // lewati baris header ("Nama"/"Nama Lengkap")
        if (/^nama(\s+lengkap)?$/i.test(name)) continue;
        const nis = String(row?.[1] ?? '').trim();
        parsed.push({ full_name: name, nis: nis || null });
      }

      if (parsed.length === 0) {
        setImportResult({
          added: 0,
          skipped: 0,
          errors: ['File tidak berisi nama siswa. Pastikan kolom A = Nama.'],
        });
        return;
      }

      const errors: string[] = [];

      // buat identitas siswa (batch)
      const { data: inserted, error: stErr } = await supabase
        .from('students')
        .insert(parsed)
        .select('id, full_name');
      if (stErr || !inserted) {
        setImportResult({
          added: 0,
          skipped: parsed.length,
          errors: ['Gagal membuat siswa: ' + (stErr?.message ?? '')],
        });
        return;
      }

      // enroll semua ke kelas + semester terpilih
      const enrollRows = (inserted as { id: string }[]).map((s) => ({
        student_id: s.id,
        class_id: importClassId,
        term_id: importTermId,
        start_date: todayISO(),
      }));
      const { error: enErr } = await supabase
        .from('enrollments')
        .insert(enrollRows);
      if (enErr) {
        errors.push(
          'Siswa dibuat, tetapi sebagian gagal didaftarkan ke kelas: ' +
            enErr.message
        );
      }

      setImportResult({
        added: inserted.length,
        skipped: rows.length - parsed.length,
        errors,
      });
      load();
    } catch (err) {
      setImportResult({
        added: 0,
        skipped: 0,
        errors: ['Gagal membaca file Excel: ' + (err as Error).message],
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Siswa"
        subtitle="Identitas siswa & keanggotaan kelas per semester"
        action={
          <div className="flex gap-2">
            <button className={btnSecondary} onClick={openImport}>
              <FileSpreadsheet className="h-4 w-4" /> Import Excel
            </button>
            <button
              className={btnPrimary}
              onClick={() => {
                setStudentForm(emptyStudent);
                setStudentModal(true);
              }}
            >
              <Plus className="h-4 w-4" /> Tambah Siswa
            </button>
          </div>
        }
      />

      <input
        className={`${inputCls} mb-4 max-w-sm`}
        placeholder="Cari nama / NIS…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'Tidak ada siswa yang cocok' : 'Belum ada siswa'}
          hint={search ? undefined : 'Tambahkan siswa pertama.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">NIS</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{s.nis || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.gender || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={s.status === 'aktif'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className={btnSmall}
                        onClick={() => loadEnrollments(s)}
                      >
                        Enrollment
                      </button>
                      <button
                        className={btnSmall}
                        onClick={() => {
                          setStudentForm({
                            id: s.id,
                            full_name: s.full_name,
                            nis: s.nis ?? '',
                            gender: s.gender ?? '',
                            status: s.status,
                          });
                          setStudentModal(true);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form siswa */}
      <Modal
        open={studentModal}
        title={studentForm.id ? 'Edit Siswa' : 'Tambah Siswa'}
        onClose={() => setStudentModal(false)}
      >
        <form onSubmit={saveStudent} className="space-y-4">
          <Field label="Nama Lengkap" required>
            <input
              className={inputCls}
              value={studentForm.full_name}
              onChange={(e) =>
                setStudentForm({ ...studentForm, full_name: e.target.value })
              }
              required
            />
          </Field>
          <Field label="NIS">
            <input
              className={inputCls}
              value={studentForm.nis}
              onChange={(e) =>
                setStudentForm({ ...studentForm, nis: e.target.value })
              }
            />
          </Field>
          <Field label="Gender">
            <select
              className={inputCls}
              value={studentForm.gender}
              onChange={(e) =>
                setStudentForm({ ...studentForm, gender: e.target.value })
              }
            >
              <option value="">— tidak diisi —</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </Field>
          <Field label="Status Global">
            <select
              className={inputCls}
              value={studentForm.status}
              onChange={(e) =>
                setStudentForm({
                  ...studentForm,
                  status: e.target.value as 'aktif' | 'nonaktif',
                })
              }
            >
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setStudentModal(false)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Panel enrollment */}
      <Modal
        open={!!enrollStudent}
        title={`Enrollment — ${enrollStudent?.full_name ?? ''}`}
        onClose={() => setEnrollStudent(null)}
        wide
      >
        <form
          onSubmit={addEnrollment}
          className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4"
        >
          <Field label="Kelas" required>
            <select
              className={inputCls}
              value={newEnroll.class_id}
              onChange={(e) =>
                setNewEnroll({ ...newEnroll, class_id: e.target.value })
              }
              required
            >
              <option value="">— pilih —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.schools?.name} — {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Term" required>
            <select
              className={inputCls}
              value={newEnroll.term_id}
              onChange={(e) =>
                setNewEnroll({ ...newEnroll, term_id: e.target.value })
              }
              required
            >
              <option value="">— pilih —</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {termLabel(t)}
                  {t.is_active ? ' (aktif)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tanggal Mulai" required>
            <input
              type="date"
              className={inputCls}
              value={newEnroll.start_date}
              onChange={(e) =>
                setNewEnroll({ ...newEnroll, start_date: e.target.value })
              }
              required
            />
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              className={`${btnPrimary} w-full`}
              disabled={saving}
            >
              Daftarkan
            </button>
          </div>
        </form>

        {enrollLoading ? (
          <LoadingState text="Memuat enrollment…" />
        ) : enrollments.length === 0 ? (
          <EmptyState
            title="Belum terdaftar di kelas mana pun"
            hint="Gunakan form di atas untuk mendaftarkan siswa."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Kelas</th>
                  <th className="px-3 py-2">Term</th>
                  <th className="px-3 py-2">Mulai</th>
                  <th className="px-3 py-2">Selesai</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((en) => (
                  <tr key={en.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      {(en.classes as any)?.schools?.name} —{' '}
                      {en.classes?.name}
                    </td>
                    <td className="px-3 py-2">
                      {en.academic_terms
                        ? termLabel(en.academic_terms)
                        : '-'}
                    </td>
                    <td className="px-3 py-2">
                      {formatDateShort(en.start_date)}
                    </td>
                    <td className="px-3 py-2">
                      {en.end_date ? (
                        formatDateShort(en.end_date)
                      ) : (
                        <span className="text-green-600">masih aktif</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {!en.end_date && (
                          <button
                            className={btnSmall}
                            onClick={() => endEnrollment(en)}
                          >
                            Keluarkan
                          </button>
                        )}
                        <button
                          className={`${btnSmall} text-red-600`}
                          onClick={() => setToDelete(en)}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Import Excel */}
      <Modal
        open={importOpen}
        title="Import Siswa dari Excel"
        onClose={() => setImportOpen(false)}
        wide
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50 px-4 py-3 text-xs text-brand-800 ring-1 ring-brand-100">
            <p className="font-semibold">Format file (.xlsx / .xls):</p>
            <p className="mt-1">
              Kolom <b>A = Nama Lengkap</b> (wajib), kolom{' '}
              <b>B = NIS</b> (opsional). Baris pertama boleh berupa judul kolom
              (mis. &quot;Nama&quot;) — akan otomatis dilewati.
            </p>
            <p className="mt-1">
              Semua siswa akan dibuat lalu langsung didaftarkan ke kelas &amp;
              semester yang dipilih di bawah.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kelas tujuan" required>
              <select
                className={inputCls}
                value={importClassId}
                onChange={(e) => setImportClassId(e.target.value)}
              >
                <option value="">— pilih kelas —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.schools?.name} — {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Semester tujuan" required>
              <select
                className={inputCls}
                value={importTermId}
                onChange={(e) => setImportTermId(e.target.value)}
              >
                <option value="">— pilih semester —</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {termLabel(t)}
                    {t.is_active ? ' (aktif)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={handleImportFile}
          />
          <button
            type="button"
            disabled={importing || !importClassId || !importTermId}
            onClick={() => importFileRef.current?.click()}
            className={`${btnPrimary} w-full`}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? 'Mengimpor…' : 'Pilih File Excel & Import'}
          </button>

          {importResult && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-800">Hasil import</p>
              <p className="mt-1 text-emerald-700">
                {importResult.added} siswa ditambahkan &amp; didaftarkan.
              </p>
              {importResult.skipped > 0 && (
                <p className="text-slate-500">
                  {importResult.skipped} baris dilewati (kosong/judul).
                </p>
              )}
              {importResult.errors.map((er, i) => (
                <p key={i} className="mt-1 text-red-600">
                  {er}
                </p>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus enrollment?"
        message="Menghapus enrollment hanya disarankan bila salah input. Jika siswa keluar dari kelas, gunakan 'Keluarkan' agar histori presensi tetap utuh."
        confirmLabel="Hapus"
        danger
        onConfirm={() => toDelete && deleteEnrollment(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
