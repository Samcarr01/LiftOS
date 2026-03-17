'use client';

import { useState, useEffect } from 'react';

const DISMISS_KEY = 'liftos-pwa-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable]   = useState(false);
  const [isDismissed, setIsDismissed]       = useState(false);
  const [isInstalled, setIsInstalled]       = useState(false);

  useEffect(() => {
    // Already installed as standalone PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Dismissed before
    if (localStorage.getItem(DISMISS_KEY) === '1') {
      setIsDismissed(true);
    }

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setIsInstallable(false);
    }
    setPromptEvent(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setIsDismissed(true);
  }

  return { isInstallable, isInstalled, isDismissed, install, dismiss };
}
