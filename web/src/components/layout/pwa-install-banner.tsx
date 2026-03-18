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
    <div className="fixed inset-x-0 bottom-24 z-50 mx-4 flex items-center gap-3 rounded-xl border border-white/[0.12] bg-[oklch(0.24_0.016_264/0.95)] px-4 py-3 backdrop-blur-xl md:bottom-6 md:left-auto md:right-24 md:w-80">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12">
        <Smartphone className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-card-title">Install LiftOS</p>
        <p className="text-caption">Keep the gym tracker one tap away.</p>
      </div>
      <button
        onClick={() => void install()}
        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
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
