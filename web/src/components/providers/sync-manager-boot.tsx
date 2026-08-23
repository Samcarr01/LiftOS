'use client';

import { useEffect } from 'react';

export function SyncManagerBoot() {
  useEffect(() => {
    const idle = 'requestIdleCallback' in window ? requestIdleCallback : setTimeout;
    idle(() => { void import('@/lib/offline/sync-manager').then(m => m.startSyncManager()); });
  }, []);
  return null;
}
