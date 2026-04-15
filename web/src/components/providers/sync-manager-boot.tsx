'use client';

import { useEffect } from 'react';
import { startSyncManager } from '@/lib/offline';

export function SyncManagerBoot() {
  useEffect(() => {
    startSyncManager();
  }, []);
  return null;
}
