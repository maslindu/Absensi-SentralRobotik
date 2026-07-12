'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/toast';
import type { MeetingPhoto } from '@/lib/types';
import { STORAGE_BUCKET } from '@/lib/types';
import { ConfirmDialog, Spinner, btnSecondary } from '@/components/ui';

interface PhotoWithUrl extends MeetingPhoto {
  url: string | null;
}

export default function PhotoUploader({
  meetingId,
  readOnly,
}: {
  meetingId: string;
  readOnly: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<PhotoWithUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('meeting_photos')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('sort_order');
    if (error) {
      toast('Gagal memuat foto: ' + error.message, 'error');
      setLoading(false);
      return;
    }
    const rows = (data as MeetingPhoto[]) ?? [];
    // bucket privat -> tampilkan lewat signed URL
    const withUrls: PhotoWithUrl[] = await Promise.all(
      rows.map(async (p) => {
        const { data: signed } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(p.file_path, 3600);
        return { ...p, url: signed?.signedUrl ?? null };
      })
    );
    setPhotos(withUrls);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photos.length >= 2) {
      toast('Maksimum 2 foto per pertemuan', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast('File harus berupa gambar', 'error');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${meetingId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file);
    if (upErr) {
      setUploading(false);
      toast('Gagal upload: ' + upErr.message, 'error');
      return;
    }

    const { error: insErr } = await supabase.from('meeting_photos').insert({
      meeting_id: meetingId,
      file_path: path,
      sort_order: photos.length + 1,
    });
    setUploading(false);
    if (insErr) {
      // trigger enforce_photo_limit menolak foto ke-3
      await supabase.storage.from(STORAGE_BUCKET).remove([path]);
      toast(
        insErr.message.includes('Maksimum')
          ? 'Maksimum 2 foto per pertemuan'
          : 'Gagal menyimpan foto: ' + insErr.message,
        'error'
      );
      return;
    }
    toast('Foto terunggah');
    if (inputRef.current) inputRef.current.value = '';
    load();
  }

  async function deletePhoto(p: PhotoWithUrl) {
    setDeleting(true);
    const { error } = await supabase
      .from('meeting_photos')
      .delete()
      .eq('id', p.id);
    if (!error) {
      await supabase.storage.from(STORAGE_BUCKET).remove([p.file_path]);
    }
    setDeleting(false);
    setToDelete(null);
    if (error) {
      toast('Gagal menghapus foto: ' + error.message, 'error');
      return;
    }
    toast('Foto dihapus');
    load();
  }

  return (
    <div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
          <Spinner className="h-4 w-4" /> Memuat foto…
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt="Dokumentasi pertemuan"
                  className="h-32 w-44 rounded-xl border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-32 w-44 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-400">
                  Gagal memuat
                </div>
              )}
              {!readOnly && (
                <button
                  onClick={() => setToDelete(p)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white shadow"
                  aria-label="Hapus foto"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {!readOnly && photos.length < 2 && (
            <label
              className={`flex h-32 w-44 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 ${
                uploading ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {uploading ? (
                <Spinner className="h-5 w-5" />
              ) : (
                <>
                  <span className="text-2xl">📷</span>
                  <span className="text-xs font-medium">
                    Tambah Foto ({photos.length}/2)
                  </span>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          )}

          {photos.length === 0 && (readOnly || photos.length >= 2) && (
            <p className="py-4 text-sm text-gray-400">Belum ada dokumentasi.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus foto?"
        message="Foto dokumentasi ini akan dihapus permanen."
        confirmLabel="Hapus"
        danger
        loading={deleting}
        onConfirm={() => toDelete && deletePhoto(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
