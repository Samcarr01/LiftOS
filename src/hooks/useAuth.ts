/**
 * useAuth — bootstraps Supabase auth and keeps the store in sync.
 *
 * Call once in app/_layout.tsx. All other components read from useAuthStore.
 */

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore, loadUserProfile } from '@/store/auth-store';

export function useAuth() {
  const { setSession, setProfile, setLoading } = useAuthStore();

  useEffect(() => {
    // Restore persisted session from SecureStore
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const profile = await loadUserProfile(session.user.id);
        setProfile(profile);
      } else {
        setLoading(false);
      }
    });

    // Keep store in sync with every auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);

        if (session?.user) {
          const profile = await loadUserProfile(session.user.id);
          setProfile(profile);
        } else {
          setProfile(null);
        }

        // PASSWORD_RECOVERY is handled by app/(auth)/reset.tsx
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export { useAuthStore };
