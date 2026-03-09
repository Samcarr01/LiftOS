/**
 * analytics.ts — lightweight PostHog analytics wrapper.
 *
 * Uses the PostHog REST API (`/capture/`) so no SDK install is required.
 * Set EXPO_PUBLIC_POSTHOG_KEY + EXPO_PUBLIC_POSTHOG_HOST in .env to enable.
 * Falls back to console.log in dev when keys are absent.
 *
 * Usage:
 *   import { track } from '@/lib/analytics';
 *   track('workout_started', { template_id: 'abc' });
 *
 * Canonical event names (matches Claude-ai.md analytics spec):
 *   workout_started, set_logged, workout_completed, pr_achieved
 *   suggestion_accepted, suggestion_dismissed
 *   exercise_created, template_created
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ── Config ────────────────────────────────────────────────────────────────────

const POSTHOG_KEY  = process.env.EXPO_PUBLIC_POSTHOG_KEY  ?? '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
const IS_DEV       = __DEV__;
const APP_VERSION  = Constants.expoConfig?.version ?? '1.0.0';

// ── Distinct ID ───────────────────────────────────────────────────────────────
// Set this from auth store after sign-in to associate events with a user.
let _distinctId = 'anonymous';

export function identifyUser(userId: string): void {
  _distinctId = userId;
}

export function resetIdentity(): void {
  _distinctId = 'anonymous';
}

// ── Core track fn ─────────────────────────────────────────────────────────────

export function track(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  const payload = {
    api_key:     POSTHOG_KEY,
    distinct_id: _distinctId,
    event,
    properties: {
      ...properties,
      $lib:         'liftos-mobile',
      $lib_version: APP_VERSION,
      platform:     Platform.OS,
    },
    timestamp: new Date().toISOString(),
  };

  if (IS_DEV || !POSTHOG_KEY) {
    // Dev: log to console, don't hit the network
    console.log('[analytics]', event, properties);
    return;
  }

  // Fire-and-forget — analytics must never block the UI
  fetch(`${POSTHOG_HOST}/capture/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  }).catch(() => {
    // Silently swallow network errors — analytics are best-effort
  });
}

// ── Typed event helpers ───────────────────────────────────────────────────────

export const Analytics = {
  workoutStarted(props: { template_id: string | null; exercise_count: number }) {
    track('workout_started', props);
  },
  setLogged(props: { exercise_id: string; set_type: string; volume_kg: number }) {
    track('set_logged', props);
  },
  workoutCompleted(props: {
    duration_seconds: number;
    total_sets: number;
    total_volume_kg: number;
    exercise_count: number;
    is_offline: boolean;
  }) {
    track('workout_completed', props);
  },
  prAchieved(props: { exercise_name: string; record_type: string; record_value: number }) {
    track('pr_achieved', props);
  },
  suggestionAccepted(props: { exercise_id: string }) {
    track('suggestion_accepted', props);
  },
  suggestionDismissed(props: { exercise_id: string }) {
    track('suggestion_dismissed', props);
  },
  exerciseCreated(props: { muscle_groups: string[]; tracking_mode: string }) {
    track('exercise_created', props);
  },
  templateCreated(props: { template_id: string }) {
    track('template_created', props);
  },
} as const;
