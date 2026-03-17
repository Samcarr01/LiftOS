'use client';

/**
 * PWA install banner — shows on second+ visit when the browser supports install.
 * Renders at the bottom of the screen, above the nav bar.
 * Dismissed state persists in localStorage (handled by usePwaInstall).
 */

import { Smartphone, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { useEffect, useState } from 'react';

const VISIT_KEY = 'liftos-visit-count';

export function PwaInstallBanner() {
  const { isInstallable, isInstalled, isDismissed, install, dismiss } = usePwaInstall();
  const [isSecondVisit, setIsSecondVisit] = useState(false);

  useEffect(() => {
    const count = parseInt(localStorage.getItem(VISIT_KEY) ?? '0', 10) + 1;
    localStorage.setItem(VISIT_KEY, String(count));
    setIsSecondVisit(count >= 2);
  }, []);

  if (!isInstallable || isInstalled || isDismissed || !isSecondVisit) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-50 flex items-center gap-3 mx-4 mb-1 rounded-2xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <Smartphone className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Add to Home Screen</p>
        <p className="text-xs text-muted-foreground">Install for faster gym access</p>
      </div>
      <button
        onClick={() => void install()}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
