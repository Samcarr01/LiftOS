'use client';

import { useEffect } from 'react';

// Screen Wake Lock API: keeps the phone from sleeping while a session is open.
// Browsers automatically release the lock when the tab is hidden, so we listen
// to visibilitychange and re-acquire when the tab comes back to the foreground.
// Silently noops on browsers without support (older Safari, etc).

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // User declined, battery-saver, or permission denied — silent fallback
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinel) void sentinel.release().catch(() => {});
    };
  }, [active]);
}
