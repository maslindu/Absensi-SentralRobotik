'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { Meeting, RoleName } from '@/lib/types';
import { formatDate, termLabel } from '@/lib/format';
import AttendanceEditor from '@/components/attendance-editor';
import PhotoUploader from '@/components/photo-uploader';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Spinner,
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnSmall,
  inputCls,
} from '@/components/ui';

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RoleName | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    meeting_date: '',
    material: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [meetingRes, userRes] = await Promise.all([
      supabase
        .from('meetings')
        .select(
          '*, schools:school_id(id, name), classes:class_id(id, name), academic_terms:term_id(id, year_label, semester), scheduled_teacher:scheduled_teacher_id(id, full_name), actual_teacher:actual_teacher_id(id, full_name)'
        )
        .eq('id', meetingId)
        .maybeSingle(),
      supabase.auth.getUser(),
    ]);

    if (meetingRes.error) {
      toast('Gagal memuat pertemuan: ' + meetingRes.error.message, 'error');
    }
    setMeeting((meetingRes.data as Meeting) ?? null);

    const user = userRes.data.user;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('roles:role_id(name)')
        .eq('id', user.id)
        .single();
      setRole(((profile?.roles as any)?.name ?? null) as RoleName | null);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;

  if (!meeting) {
    return (
      <EmptyState
        title="Pertemuan tidak ditemukan"
        hint="Laporan mungkin sudah dihapus atau kamu tidak punya akses."
      />
    );
  }

  // Ketua dihapus; admin & guru pemilik boleh mengedit (dipaksakan RLS).
  const readOnly = false;

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from('meetings')
      .update({
        meeting_date: editForm.meeting_date,
        material: editForm.material.trim() || null,
        notes: editForm.notes.trim() || null,
      })
      .eq('id', meetingId);
    setSaving(false);
    if (error) {
      toast('Gagal menyimpan: ' + error.message, 'error');
      return;
    }
    toast('Laporan diperbarui');
    setEditOpen(false);
    load();
  }

  async function deleteMeeting() {
    setDeleting(true);
    const { error } = await supabase
      .from('meetings')
      .delete()
      .eq('id', meetingId);
    setDeleting(false);
    setDeleteOpen(false);
    if (error) {
      toast('Gagal menghapus: ' + error.message, 'error');
      return;
    }
    toast('Pertemuan dihapus');
    router.push(role === 'admin' ? '/monitor' : '/teacher/meetings');
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Pertemuan ke-${meeting.meeting_number}`}
        subtitle={`${meeting.schools?.name} — Kelas ${meeting.classes?.name}`}
        action={
          !readOnly ? (
            <div className="flex gap-2">
              <button
                className={btnSmall}
                onClick={() => {
                  setEditForm({
                    meeting_date: meeting.meeting_date,
                    material: meeting.material ?? '',
                    notes: meeting.notes ?? '',
                  });
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              {role === 'admin' && (
                <button
                  className={`${btnSmall} text-red-600`}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="card mb-5 grid gap-3 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-400">Tanggal</p>
          <p className="font-medium">{formatDate(meeting.meeting_date)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Term</p>
          <p className="font-medium">
            {meeting.academic_terms ? termLabel(meeting.academic_terms) : '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Guru Utama</p>
          <p className="font-medium">
            {meeting.scheduled_teacher?.full_name ?? '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Guru Pelaksana</p>
          <p className="font-medium">{meeting.actual_teacher?.full_name}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-slate-400">Materi</p>
          <p className="whitespace-pre-wrap">{meeting.material || '-'}</p>
        </div>
        {meeting.notes && (
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-400">Catatan</p>
            <p className="whitespace-pre-wrap">{meeting.notes}</p>
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">
        Presensi Siswa
      </h2>
      <AttendanceEditor
        meetingId={meeting.id}
        classId={meeting.class_id}
        termId={meeting.term_id}
        meetingDate={meeting.meeting_date}
        readOnly={readOnly}
      />

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700">
        Dokumentasi (maks. 2 foto)
      </h2>
      <PhotoUploader meetingId={meeting.id} readOnly={readOnly} />

      {/* Edit info pertemuan */}
      <Modal
        open={editOpen}
        title="Edit Laporan"
        onClose={() => setEditOpen(false)}
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Tanggal Pertemuan" required>
            <input
              type="date"
              className={inputCls}
              value={editForm.meeting_date}
              onChange={(e) =>
                setEditForm({ ...editForm, meeting_date: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Materi" required>
            <textarea
              className={`${inputCls} min-h-24`}
              value={editForm.material}
              onChange={(e) =>
                setEditForm({ ...editForm, material: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Catatan">
            <textarea
              className={`${inputCls} min-h-16`}
              value={editForm.notes}
              onChange={(e) =>
                setEditForm({ ...editForm, notes: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setEditOpen(false)}
            >
              Batal
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Simpan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Hapus pertemuan?"
        message="Seluruh presensi & foto pertemuan ini ikut terhapus. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus"
        danger
        loading={deleting}
        onConfirm={deleteMeeting}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
