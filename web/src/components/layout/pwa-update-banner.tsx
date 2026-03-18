'use client';

import { RefreshCw } from 'lucide-react';
import { useServiceWorkerUpdate } from '@/hooks/use-service-worker-update';

export function PwaUpdateBanner() {
  const { updateReady, reloadApp } = useServiceWorkerUpdate();

  if (!updateReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 mx-4 rounded-xl border border-white/[0.12] bg-[oklch(0.24_0.016_264/0.95)] px-4 py-3 backdrop-blur-xl md:bottom-6 md:left-auto md:right-6 md:w-80">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12">
          <RefreshCw className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-card-title">A new version is ready</p>
          <p className="text-caption">Reload to pick up the latest UI polish and fixes.</p>
        </div>
      </div>
      <button
        onClick={reloadApp}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
      >
        Reload App
      </button>
    </div>
  );
}
