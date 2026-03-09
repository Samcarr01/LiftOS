import { create } from 'zustand';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { authErrorMessage, showError } from '@/lib/toast';
import type { UnitPreference, SubscriptionTier } from '@/types';
import type { UserRow } from '@/types/database';

// Complete any pending auth session (required for WebBrowser on iOS)
WebBrowser.maybeCompleteAuthSession();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  unitPreference: UnitPreference;
  subscriptionTier: SubscriptionTier;
}

interface AuthState {
  // State
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** True on very first sign-up, triggers onboarding redirect */
  isNewUser: boolean;
  error: string | null;

  // Internal setters (used by useAuth hook)
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setIsNewUser: (val: boolean) => void;

  // Auth actions
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (patch: Partial<Pick<UserProfile, 'displayName' | 'unitPreference'>>) => Promise<void>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  isNewUser: false,
  error: null,

  // ── Internal setters ────────────────────────────────────────────────────────

  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      isLoading: false,
    }),

  setProfile: (profile) => set({ profile }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setIsNewUser: (isNewUser) => set({ isNewUser }),

  // ── Apple Sign-In ───────────────────────────────────────────────────────────

  signInWithApple: async () => {
    set({ isLoading: true, error: null });
    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        showError('Apple Sign-In is only available on iOS devices.');
        set({ isLoading: false });
        return;
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;

      // Apple only provides full_name on the very first sign-in.
      // Persist it to auth user metadata so handle_new_user trigger can use it.
      if (credential.fullName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ');
        if (fullName) {
          await supabase.auth.updateUser({ data: { full_name: fullName } });
        }
      }
    } catch (err: unknown) {
      // User cancelled — don't show error
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        set({ isLoading: false });
        return;
      }
      const msg = authErrorMessage(err);
      set({ error: msg, isLoading: false });
      showError(msg, 'Apple Sign-In Failed');
    }
  },

  // ── Google OAuth ─────────────────────────────────────────────────────────────

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const redirectUrl = Linking.createURL('auth/callback');

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) throw oauthError;
      if (!data.url) throw new Error('No OAuth URL returned from Supabase.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success') {
        const { url } = result;
        // Exchange the code from the callback URL for a session
        await supabase.auth.exchangeCodeForSession(url);
      } else {
        // User cancelled or dismissed
        set({ isLoading: false });
      }
    } catch (err) {
      const msg = authErrorMessage(err);
      set({ error: msg, isLoading: false });
      showError(msg, 'Google Sign-In Failed');
    }
  },

  // ── Email + Password Sign-In ──────────────────────────────────────────────

  signInWithEmail: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      // Session update handled by onAuthStateChange in useAuth hook
    } catch (err) {
      const msg = authErrorMessage(err);
      set({ error: msg, isLoading: false });
    }
  },

  // ── Sign Up ───────────────────────────────────────────────────────────────

  signUp: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const redirectUrl =
        Platform.OS === 'web'
          ? window.location.origin
          : Linking.createURL('verify');

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectUrl },
      });

      if (error) throw error;

      // If session is null, email verification is required
      if (!data.session) {
        showError(
          'Check your email to confirm your account, then sign in.',
          'Verify Your Email'
        );
        set({ isLoading: false });
        return;
      }

      // Immediate session = email confirmations disabled (dev mode)
      set({ isNewUser: true });
    } catch (err) {
      const msg = authErrorMessage(err);
      set({ error: msg, isLoading: false });
    }
  },

  // ── Sign Out ──────────────────────────────────────────────────────────────

  signOut: async () => {
    set({ isLoading: true, error: null });
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors; clear state regardless
    } finally {
      set({
        session: null,
        user: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false,
        isNewUser: false,
      });
    }
  },

  // ── Password Reset ────────────────────────────────────────────────────────

  resetPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const redirectUrl = Linking.createURL('reset');
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
      showError(
        'Password reset email sent. Check your inbox.',
        'Check Your Email'
      );
    } catch (err) {
      const msg = authErrorMessage(err);
      set({ error: msg });
      showError(msg, 'Reset Failed');
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Update Profile ────────────────────────────────────────────────────────

  updateProfile: async (patch) => {
    const { user } = get();
    if (!user) return;

    try {
      const dbPatch: { display_name?: string | null; unit_preference?: 'kg' | 'lb' } = {};
      if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
      if (patch.unitPreference !== undefined) dbPatch.unit_preference = patch.unitPreference;

      const { error } = await supabase
        .from('users')
        .update(dbPatch)
        .eq('id', user.id);

      if (error) throw error;

      const current = get().profile;
      if (current) {
        set({ profile: { ...current, ...patch } });
      }
    } catch (err) {
      showError(authErrorMessage(err), 'Update Failed');
    }
  },
}));

// ── Profile loader (shared by useAuth hook) ───────────────────────────────────

export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  const { data } = (await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()) as { data: UserRow | null; error: unknown };

  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    unitPreference: data.unit_preference,
    subscriptionTier: data.subscription_tier,
  };
}
