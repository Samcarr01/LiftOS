'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Camera, Check, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';

interface Props {
  userId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
  size?: number;
}

/**
 * Reads a File into a data URL suitable for <img> and Cropper.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Crops the source image to the pixel rect and returns a square JPEG blob.
 * Fills transparent pixels with black (default canvas bg) — PNGs with alpha
 * no longer produce "white corners" because we crop to a square that
 * matches the visible circle, and the canvas is filled behind the image.
 */
async function renderCrop(dataUrl: string, crop: Area, outSize = 512): Promise<Blob> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('Image load failed'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d')!;
  // Neutral dark fill so any transparent pixels blend with app surface
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, outSize, outSize);
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, outSize, outSize);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))),
      'image/jpeg',
      0.9,
    ),
  );
}

function CropDialog({
  open,
  source,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  source: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  busy: boolean;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedPxRef = useRef<Area | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    croppedPxRef.current = pixels;
  }, []);

  async function handleConfirm() {
    if (!source || !croppedPxRef.current) return;
    try {
      const blob = await renderCrop(source, croppedPxRef.current, 512);
      onConfirm(blob);
    } catch {
      toast.error('Could not process image');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md border-white/[0.07] bg-card p-0 text-foreground">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-base">Crop photo</DialogTitle>
        </DialogHeader>

        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden bg-black">
          {source && (
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="px-5 pb-2">
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-[oklch(0.80_0.16_55)]"
            aria-label="Zoom"
          />
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="premium-button-secondary flex-1 justify-center disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="premium-button flex-1 justify-center disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AvatarUploader({ userId, displayName, email, avatarUrl, onChange, size = 64 }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const initial = (displayName || email || '?')[0]?.toUpperCase() ?? '?';

  async function handleFile(file: File) {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image must be under 10MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setCropSource(dataUrl);
    } catch {
      toast.error('Could not read image');
    }
  }

  async function handleConfirmCrop(blob: Blob) {
    setBusy(true);
    try {
      const supabase = createClient();
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
      setImgBroken(false);
      setCropSource(null);
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
      setImgBroken(false);
      toast.success('Photo removed');
    } catch {
      toast.error('Failed to remove');
    } finally {
      setBusy(false);
    }
  }

  const showImage = avatarUrl && !imgBroken;

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[oklch(0.75_0.18_55/0.12)] text-[oklch(0.80_0.16_55)] font-display font-bold"
          style={{ fontSize: size * 0.38 }}
          aria-label="Change profile picture"
        >
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="absolute inset-0 h-full w-full rounded-full object-cover"
              onError={() => setImgBroken(true)}
            />
          ) : (
            <span>{initial}</span>
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Camera className="h-4 w-4 text-white" />}
          </div>
        </button>

        {showImage && !busy && (
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
            if (file) void handleFile(file);
          }}
        />
      </div>

      <CropDialog
        open={!!cropSource}
        source={cropSource}
        busy={busy}
        onCancel={() => !busy && setCropSource(null)}
        onConfirm={(blob) => void handleConfirmCrop(blob)}
      />
    </>
  );
}
