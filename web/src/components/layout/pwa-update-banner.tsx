'use client';

import { RefreshCw } from 'lucide-react';
import { useServiceWorkerUpdate } from '@/hooks/use-service-worker-update';

export function PwaUpdateBanner() {
  const { updateReady, reloadApp } = useServiceWorkerUpdate();

  if (!updateReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-32 z-50 mx-4 rounded-2xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm md:bottom-6 md:left-auto md:right-6 md:w-80">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <RefreshCw className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">A new version is ready</p>
          <p className="text-xs text-muted-foreground">Reload the app to get the latest fixes.</p>
        </div>
      </div>
      <button
        onClick={reloadApp}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Reload App
      </button>
    </div>
  );
}
