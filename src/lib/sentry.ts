/**
 * sentry.ts — crash reporting wrapper around @sentry/react-native.
 *
 * Gracefully no-ops when the package is not installed.
 * Install with: npx expo install @sentry/react-native
 *
 * Set EXPO_PUBLIC_SENTRY_DSN in .env to enable.
 *
 * Usage:
 *   import { initSentry, captureException } from '@/lib/sentry';
 *   initSentry();                          // call once in app/_layout.tsx
 *   captureException(err);                 // call in catch blocks
 *   captureMessage('Something happened');  // informational
 */

import Constants from 'expo-constants';

// ── Graceful no-op when @sentry/react-native is not installed ─────────────────

interface SentryLike {
  init: (config: {
    dsn: string;
    release?: string;
    dist?: string;
    environment?: string;
    tracesSampleRate?: number;
    debug?: boolean;
    enabled?: boolean;
  }) => void;
  captureException: (err: unknown, hint?: Record<string, unknown>) => string;
  captureMessage: (msg: string, level?: string) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrap: <T extends (...args: any[]) => any>(fn: T) => T;
  withScope: (callback: (scope: { setTag: (k: string, v: string) => void; setUser: (u: { id: string } | null) => void }) => void) => void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
let Sentry: SentryLike | null = (() => { try { return require('@sentry/react-native') as SentryLike; } catch { return null; } })();

// ── Config ────────────────────────────────────────────────────────────────────

const DSN         = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const IS_DEV      = __DEV__;

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once in app/_layout.tsx before any other app code. */
export function initSentry(): void {
  if (!Sentry || !DSN) {
    if (IS_DEV) console.log('[sentry] disabled (no DSN or package not installed)');
    return;
  }

  Sentry.init({
    dsn:              DSN,
    release:          `liftos@${APP_VERSION}`,
    environment:      IS_DEV ? 'development' : 'production',
    tracesSampleRate: IS_DEV ? 0 : 0.2,
    debug:            IS_DEV,
    enabled:          !IS_DEV,
  });
}

/** Set user context (call after sign-in, clear on sign-out). */
export function setSentryUser(userId: string | null): void {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    scope.setUser(userId ? { id: userId } : null);
  });
}

/** Report an unexpected error. Safe to call anywhere — swallows its own errors. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (IS_DEV) {
    console.error('[sentry captureException]', err, context);
    return;
  }
  try {
    Sentry?.captureException(err, context);
  } catch {
    // Never let error reporting crash the app
  }
}

/** Report an informational message. */
export function captureMessage(msg: string): void {
  if (IS_DEV) {
    console.warn('[sentry captureMessage]', msg);
    return;
  }
  try {
    Sentry?.captureMessage(msg);
  } catch {
    // Silent
  }
}
