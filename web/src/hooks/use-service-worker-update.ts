'use client';

import { useEffect, useState } from 'react';

export function useServiceWorkerUpdate() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

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

    const handleControllerChange = () => {
      markUpdateReady();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      if (activeRegistration && handleUpdateFound) {
        activeRegistration.removeEventListener('updatefound', handleUpdateFound);
      }
    };
  }, []);

  function reloadApp() {
    window.location.reload();
  }

  return {
    updateReady,
    reloadApp,
  };
}
