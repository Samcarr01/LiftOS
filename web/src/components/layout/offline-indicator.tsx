'use client';

/**
 * OfflineProvider — dual purpose:
 * 1. Initialises the sync manager on first mount
 * 2. Shows a non-blocking offline banner when navigator.onLine === false
 *
 * Import once in root layout; it renders null when online.
 */
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { startSyncManager } from '@/lib/offline/sync-manager';

export function OfflineProvider() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Boot the sync manager (idempotent — ignores second call)
    startSyncManager();

    // Track connectivity
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update(); // initial check

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-yellow-600/95 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      Offline — your sets are saved locally
    </div>
  );
}
