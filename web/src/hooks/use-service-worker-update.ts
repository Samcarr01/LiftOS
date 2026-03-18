'use client';

import { useEffect, useState } from 'react';

export function useServiceWorkerUpdate() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Don't show banner if we just reloaded to apply an update
    const justReloaded = sessionStorage.getItem('sw-update-reload');
    if (justReloaded) {
      sessionStorage.removeItem('sw-update-reload');
      return;
    }

    let activeRegistration: ServiceWorkerRegistration | null = null;
    let handleUpdateFound: (() => void) | null = null;

    function markUpdateReady() {
      setUpdateReady(true);
    }

    function attachInstallingWorker(worker: ServiceWorker | null) {
      if (!worker) return;

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          markUpdateReady();
        }
      });
    }

    function attachRegistration(registration: ServiceWorkerRegistration | null | undefined) {
      if (!registration) return;
      activeRegistration = registration;

      if (registration.waiting) {
        markUpdateReady();
      }

      attachInstallingWorker(registration.installing);
      handleUpdateFound = () => {
        attachInstallingWorker(registration.installing);
      };
      registration.addEventListener('updatefound', handleUpdateFound);
    }

    void navigator.serviceWorker.getRegistration().then(attachRegistration);

    return () => {
      if (activeRegistration && handleUpdateFound) {
        activeRegistration.removeEventListener('updatefound', handleUpdateFound);
      }
    };
  }, []);

  function reloadApp() {
    setUpdateReady(false);
    sessionStorage.setItem('sw-update-reload', '1');

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    });
  }

  return {
    updateReady,
    reloadApp,
  };
}
