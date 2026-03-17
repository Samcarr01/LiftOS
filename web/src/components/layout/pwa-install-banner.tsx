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
    <div className="fixed inset-x-0 bottom-24 z-50 mx-4 flex items-center gap-3 rounded-[24px] border border-white/10 bg-[rgba(12,20,38,0.94)] px-4 py-3 shadow-[0_8px_24px_-8px_rgba(2,10,28,0.6)] backdrop-blur-md md:bottom-6 md:left-auto md:right-24 md:w-80">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/16 shadow-[0_14px_32px_-18px_rgba(91,163,255,0.75)]">
        <Smartphone className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold">Install LiftOS</p>
        <p className="text-xs text-muted-foreground">Keep the gym tracker one tap away.</p>
      </div>
      <button
        onClick={() => void install()}
        className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-[0_16px_30px_-18px_rgba(91,163,255,0.75)] hover:bg-primary/90"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/8"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
