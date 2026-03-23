'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';

/**
 * Mounts the Supabase auth listener so the Zustand store
 * stays in sync with the server-side session across the app.
 * Does NOT block rendering — middleware handles route protection.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
