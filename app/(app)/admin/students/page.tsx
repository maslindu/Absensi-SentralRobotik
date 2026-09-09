'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type {
  AcademicTerm,
  Class,
  Enrollment,
  School,
  Student,
} from '@/lib/types';
import { formatDateShort, termLabel, todayISO } from '@/lib/format';
import { downloadStudentTemplate, parseStudentSheet } from '@/lib/excel';
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

// baris enrollment ringkas untuk pengelompokan (tidak memuat seluruh kolom)
interface GroupEnrollment {
  student_id: string;
  class_id: string;
  end_date: string | null;
  classes: {
    id: string;
    name: string;
    schools: { id: string; name: string } | null;
  } | null;
}

interface RosterEnrollment extends GroupEnrollment {
  students: Student | null;
}

const UNASSIGNED = '__none__';

export default function AdminStudentsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [groupEnrollments, setGroupEnrollments] = useState<GroupEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [studentModal, setStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudent);
  const [saving, setSaving] = useState(false);

  // mode pilih & hapus massal
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // verifikasi kedua untuk siswa yang punya histori presensi
  const [bulkForceOpen, setBulkForceOpen] = useState(false);
  const [blockedStudents, setBlockedStudents] = useState<
    { id: string; name: string }[]
  >([]);
  const [forceDeleting, setForceDeleting] = useState(false);

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

  // Master data (kelas + term) — dimuat sekali.
  const loadMaster = useCallback(async () => {
    const [cls, sch, tm] = await Promise.all([
      supabase
        .from('classes')
        .select('*, schools:school_id(id, name)')
        .eq('is_active', true)
        .order('name'),
      supabase.from('schools').select('*').eq('is_active', true).order('name'),
      supabase
        .from('academic_terms')
        .select('*')
        .order('year_label', { ascending: false }),
    ]);
    setClasses((cls.data as Class[]) ?? []);
    setSchools((sch.data as School[]) ?? []);
    const termList = (tm.data as AcademicTerm[]) ?? [];
    setTerms(termList);
    const active = termList.find((t) => t.is_active);
    setSelectedTermId((prev) => prev || active?.id || termList[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Siswa + enrollment (untuk pengelompokan) mengikuti term terpilih.
  const loadStudents = useCallback(async (termId: string, selectedClassId: string) => {
    if (!termId || !selectedClassId) {
      setStudents([]);
      setGroupEnrollments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('enrollments')
      .select(
        'student_id, class_id, end_date, classes:class_id(id, name, schools:school_id(id, name)), students:student_id(*)'
      )
      .eq('term_id', termId)
      .eq('class_id', selectedClassId)
      .is('end_date', null)
      .order('start_date');
    if (error) toast('Gagal memuat data: ' + error.message, 'error');
    const roster = (data as unknown as RosterEnrollment[]) ?? [];
    setStudents(roster.flatMap((en) => (en.students ? [en.students] : [])));
    setGroupEnrollments(roster);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMaster();
  }, [loadMaster]);

  useEffect(() => {
    loadStudents(selectedTermId, classFilter);
  }, [selectedTermId, classFilter, loadStudents]);

  function refresh() {
    loadStudents(selectedTermId, classFilter);
  }

  const classesOfSchool = classes.filter((c) => c.school_id === schoolFilter);

  // ---- Pengelompokan siswa per kelas (berdasar enrollment aktif di term) ----
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = students.filter(
      (s) =>
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        (s.nis ?? '').toLowerCase().includes(q)
    );

    // student_id -> daftar kelas yang sedang aktif (end_date kosong)
    const membership = new Map<string, string[]>();
    const classInfo = new Map<
      string,
      { name: string; school: string }
    >();
    for (const en of groupEnrollments) {
      if (en.end_date) continue; // hanya keanggotaan yang masih aktif
      const arr = membership.get(en.student_id) ?? [];
      arr.push(en.class_id);
      membership.set(en.student_id, arr);
      if (en.classes && !classInfo.has(en.class_id)) {
        classInfo.set(en.class_id, {
          name: en.classes.name,
          school: en.classes.schools?.name ?? '—',
        });
      }
    }

    const byClass = new Map<string, Student[]>();
    for (const s of filtered) {
      const cls = membership.get(s.id);
      if (!cls || cls.length === 0) {
        const arr = byClass.get(UNASSIGNED) ?? [];
        arr.push(s);
        byClass.set(UNASSIGNED, arr);
      } else {
        for (const cid of cls) {
          const arr = byClass.get(cid) ?? [];
          arr.push(s);
          byClass.set(cid, arr);
        }
      }
    }

    const result = [...byClass.entries()]
      .filter(([cid]) => cid !== UNASSIGNED)
      .map(([cid, list]) => ({
        id: cid,
        label: classInfo.get(cid)
          ? `${classInfo.get(cid)!.school} — Kelas ${classInfo.get(cid)!.name}`
          : 'Kelas',
        sortKey: classInfo.get(cid)
          ? `${classInfo.get(cid)!.school} ${classInfo.get(cid)!.name}`
          : 'zzz',
        students: list,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'id'));

    const unassigned = byClass.get(UNASSIGNED) ?? [];
    if (unassigned.length > 0) {
      result.push({
        id: UNASSIGNED,
        label: 'Tanpa Kelas (belum terdaftar di term ini)',
        sortKey: 'zzzz',
        students: unassigned,
      });
    }
    return result;
  }, [students, groupEnrollments, search]);

  const totalShown = useMemo(
    () => groups.reduce((n, g) => n + g.students.length, 0),
    [groups]
  );

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---- Seleksi hapus massal ----
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectGroup(ids: string[], allSelected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      // Cek siswa mana yang punya histori presensi.
      const { data: att, error: attErr } = await supabase
        .from('attendance')
        .select('student_id')
        .in('student_id', ids);
      if (attErr) {
        toast('Gagal memeriksa histori presensi: ' + attErr.message, 'error');
        return;
      }
      const blockedSet = new Set(
        (att ?? []).map((a) => a.student_id as string)
      );
      const deletable = ids.filter((id) => !blockedSet.has(id));
      const nameOf = (id: string) =>
        students.find((s) => s.id === id)?.full_name ?? 'Siswa';

      // Hapus dulu siswa tanpa histori (aman) — 1 konfirmasi sudah cukup.
      if (deletable.length > 0) {
        const { error: enErr } = await supabase
          .from('enrollments')
          .delete()
          .in('student_id', deletable);
        if (enErr) {
          toast('Gagal menghapus enrollment siswa: ' + enErr.message, 'error');
          return;
        }
        const { error: stErr } = await supabase
          .from('students')
          .delete()
          .in('id', deletable);
        if (stErr) {
          toast('Gagal menghapus siswa: ' + stErr.message, 'error');
          return;
        }
      }

      setBulkOpen(false);

      if (blockedSet.size > 0) {
        // Siswa berhistori presensi -> minta verifikasi kedua yang tegas.
        setBlockedStudents(
          [...blockedSet].map((id) => ({ id, name: nameOf(id) }))
        );
        setSelectedIds(new Set([...blockedSet]));
        if (deletable.length > 0) {
          toast(
            `${deletable.length} siswa dihapus. ${blockedSet.size} lainnya punya histori presensi — perlu konfirmasi.`
          );
        }
        setBulkForceOpen(true);
        refresh();
      } else {
        toast(`${deletable.length} siswa dihapus`);
        exitSelectMode();
        refresh();
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  // Verifikasi kedua: hapus paksa siswa berhistori presensi (ikut hapus presensi).
  async function forceDelete() {
    const ids = blockedStudents.map((b) => b.id);
    if (ids.length === 0) {
      setBulkForceOpen(false);
      return;
    }
    setForceDeleting(true);
    try {
      // Urutan wajib: presensi -> enrollment -> siswa (FK on delete restrict).
      const { error: atErr } = await supabase
        .from('attendance')
        .delete()
        .in('student_id', ids);
      if (atErr) {
        toast('Gagal menghapus histori presensi: ' + atErr.message, 'error');
        return;
      }
      const { error: enErr } = await supabase
        .from('enrollments')
        .delete()
        .in('student_id', ids);
      if (enErr) {
        toast('Gagal menghapus enrollment: ' + enErr.message, 'error');
        return;
      }
      const { error: stErr } = await supabase
        .from('students')
        .delete()
        .in('id', ids);
      if (stErr) {
        toast('Gagal menghapus siswa: ' + stErr.message, 'error');
        return;
      }
      toast(`${ids.length} siswa beserta histori presensinya dihapus permanen`);
      setBulkForceOpen(false);
      setBlockedStudents([]);
      exitSelectMode();
      refresh();
    } finally {
      setForceDeleting(false);
    }
  }

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
    refresh();
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
    refresh();
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
    refresh();
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
    refresh();
  }

  function openImport() {
    const activeTerm = terms.find((t) => t.is_active);
    setImportClassId(classFilter);
    setImportTermId(selectedTermId || activeTerm?.id || '');
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
      const { rows: parsed, skipped } = await parseStudentSheet(file);

      if (parsed.length === 0) {
        setImportResult({
          added: 0,
          skipped,
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
          skipped,
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
        skipped,
        errors,
      });
      refresh();
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
          <div className="flex flex-wrap gap-2">
            <button
              className={btnSecondary}
              onClick={downloadStudentTemplate}
            >
              <Download className="h-4 w-4" /> Template Excel
            </button>
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

      {/* Toolbar: cari, filter semester, mode hapus massal */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter sekolah"
          className={`${inputCls} max-w-[16rem]`}
          value={schoolFilter}
          onChange={(e) => {
            setSchoolFilter(e.target.value);
            setClassFilter('');
            setSearch('');
            exitSelectMode();
          }}
        >
          <option value="">Pilih sekolah</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter kelas"
          className={`${inputCls} max-w-[16rem]`}
          value={classFilter}
          onChange={(e) => {
            setClassFilter(e.target.value);
            setSearch('');
            exitSelectMode();
          }}
          disabled={!schoolFilter}
        >
          <option value="">Pilih kelas</option>
          {classesOfSchool.map((classItem) => (
            <option key={classItem.id} value={classItem.id}>
              {classItem.name}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Cari nama / NIS…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!classFilter}
        />
        <select
          className={`${inputCls} max-w-[16rem]`}
          value={selectedTermId}
          onChange={(e) => setSelectedTermId(e.target.value)}
          title="Kelompokkan berdasarkan semester"
        >
          {terms.length === 0 && <option value="">— tanpa semester —</option>}
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {termLabel(t)}
              {t.is_active ? ' (aktif)' : ''}
            </option>
          ))}
        </select>
        <div className="sm:ml-auto">
          {selectMode ? (
            <button className={btnSecondary} onClick={exitSelectMode}>
              <X className="h-4 w-4" /> Selesai
            </button>
          ) : (
            <button
              className={btnSecondary}
              onClick={() => setSelectMode(true)}
              disabled={!classFilter}
            >
              <Trash2 className="h-4 w-4" /> Pilih & Hapus
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : !schoolFilter || !classFilter ? (
        <EmptyState
          title="Pilih sekolah dan kelas"
          hint="Daftar siswa akan dimuat setelah kamu memilih kelas agar halaman tetap ringan."
          icon={<Users className="h-6 w-6" />}
        />
      ) : totalShown === 0 ? (
        <EmptyState
          title={search ? 'Tidak ada siswa yang cocok' : 'Belum ada siswa'}
          hint={search ? undefined : 'Tambahkan siswa pertama atau import Excel.'}
          icon={<Users className="h-6 w-6" />}
        />
      ) : (
        <div className="space-y-4 pb-24">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            const ids = g.students.map((s) => s.id);
            const groupSelected =
              selectMode &&
              ids.length > 0 &&
              ids.every((id) => selectedIds.has(id));
            return (
              <section
                key={g.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(g.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                    <span className="font-semibold text-slate-800">
                      {g.label}
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {g.students.length}
                    </span>
                  </button>
                  {selectMode && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={groupSelected}
                        onChange={() => toggleSelectGroup(ids, groupSelected)}
                      />
                      Pilih semua
                    </label>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          {selectMode && <th className="w-10 px-4 py-3" />}
                          <th className="px-4 py-3">Nama</th>
                          <th className="px-4 py-3">NIS</th>
                          <th className="px-4 py-3">Gender</th>
                          <th className="px-4 py-3">Status</th>
                          {!selectMode && (
                            <th className="px-4 py-3 text-right">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {g.students.map((s) => {
                          const checked = selectedIds.has(s.id);
                          return (
                            <tr
                              key={s.id}
                              className={`border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${
                                selectMode && checked ? 'bg-brand-50/50' : ''
                              }`}
                              onClick={
                                selectMode
                                  ? () => toggleSelect(s.id)
                                  : undefined
                              }
                            >
                              {selectMode && (
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300"
                                    checked={checked}
                                    onChange={() => toggleSelect(s.id)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </td>
                              )}
                              <td className="px-4 py-3 font-medium">
                                {s.full_name}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {s.nis || '-'}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {s.gender || '-'}
                              </td>
                              <td className="px-4 py-3">
                                <ActiveBadge active={s.status === 'aktif'} />
                              </td>
                              {!selectMode && (
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
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Bilah aksi hapus massal (sticky) */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">
              {selectedIds.size} siswa dipilih
            </span>
            <div className="flex gap-2">
              <button className={btnSecondary} onClick={exitSelectMode}>
                Batal
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.98]"
                onClick={() => setBulkOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Hapus {selectedIds.size} siswa
              </button>
            </div>
          </div>
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
            <button
              type="button"
              onClick={downloadStudentTemplate}
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              <Download className="h-3.5 w-3.5" /> Unduh template contoh
            </button>
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

      {/* Konfirmasi hapus massal (langkah 1) */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Hapus ${selectedIds.size} siswa?`}
        message="Siswa yang belum punya histori presensi akan dihapus permanen beserta keanggotaan kelasnya. Untuk siswa yang sudah punya histori presensi, kamu akan diminta konfirmasi sekali lagi sebelum dihapus."
        confirmLabel="Lanjut hapus"
        danger
        loading={bulkDeleting}
        onConfirm={bulkDelete}
        onCancel={() => setBulkOpen(false)}
      />

      {/* Verifikasi kedua: siswa berhistori presensi (langkah 2) */}
      <ConfirmDialog
        open={bulkForceOpen}
        title={`${blockedStudents.length} siswa punya histori presensi`}
        message={
          `${
            blockedStudents.length <= 5
              ? blockedStudents.map((b) => b.name).join(', ')
              : blockedStudents
                  .slice(0, 5)
                  .map((b) => b.name)
                  .join(', ') + `, dan ${blockedStudents.length - 5} lainnya`
          } pernah tercatat dalam presensi. Menghapus permanen akan IKUT MENGHAPUS seluruh catatan presensinya dan tidak dapat dikembalikan. Tetap hapus?`
        }
        confirmLabel="Ya, hapus beserta presensi"
        danger
        loading={forceDeleting}
        onConfirm={forceDelete}
        onCancel={() => {
          setBulkForceOpen(false);
          setBlockedStudents([]);
          exitSelectMode();
        }}
      />

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
