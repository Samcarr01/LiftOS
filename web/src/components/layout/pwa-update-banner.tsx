'use client';

import { RefreshCw } from 'lucide-react';
import { useServiceWorkerUpdate } from '@/hooks/use-service-worker-update';

export function PwaUpdateBanner() {
  const { updateReady, reloadApp } = useServiceWorkerUpdate();

  if (!updateReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 mx-4 rounded-[24px] border border-white/10 bg-[rgba(12,20,38,0.9)] px-4 py-3 shadow-[0_22px_55px_-28px_rgba(2,10,28,0.95)] backdrop-blur-xl md:bottom-6 md:left-auto md:right-6 md:w-80">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/16 shadow-[0_14px_32px_-18px_rgba(91,163,255,0.75)]">
          <RefreshCw className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">A new version is ready</p>
          <p className="text-xs text-muted-foreground">Reload to pick up the latest UI polish and fixes.</p>
        </div>
      </div>
      <button
        onClick={reloadApp}
        className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_18px_36px_-18px_rgba(91,163,255,0.8)] hover:bg-primary/90"
      >
        Reload App
      </button>
    </div>
  );
}
