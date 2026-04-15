'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface Props {
  userId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
  size?: number;
}

async function downscaleToJpegBlob(file: File, maxDim: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))),
      'image/jpeg',
      0.85,
    ),
  );
}

export function AvatarUploader({ userId, displayName, email, avatarUrl, onChange, size = 64 }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const initial = (displayName || email || '?')[0]?.toUpperCase() ?? '?';

  async function upload(file: File) {
    setBusy(true);
    try {
      const supabase = createClient();
      const blob = await downscaleToJpegBlob(file, 512);
      const path = `${userId}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
        cacheControl: '0',
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustedUrl = `${pub.publicUrl}?v=${Date.now()}`;
      await supabase.from('users').update({ avatar_url: bustedUrl }).eq('id', userId);
      onChange(bustedUrl);
      toast.success('Photo updated');
    } catch (err) {
      toast.error((err as { message?: string }).message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.storage.from('avatars').remove([`${userId}.jpg`]);
      await supabase.from('users').update({ avatar_url: null }).eq('id', userId);
      onChange(null);
      toast.success('Photo removed');
    } catch {
      toast.error('Failed to remove');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[oklch(0.75_0.18_55/0.12)] text-[oklch(0.80_0.16_55)] font-display font-bold"
        style={{ fontSize: size * 0.38 }}
        aria-label="Change profile picture"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Camera className="h-4 w-4 text-white" />}
        </div>
      </button>

      {avatarUrl && !busy && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void remove(); }}
          aria-label="Remove profile picture"
          className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-card text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
