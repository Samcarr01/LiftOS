/**
 * Training preferences persistence. Cut-Aware Progression v1, §7.4, §10.3.
 *
 * `users.body_weight_kg` is the authoritative current weight; `body_weight_logs`
 * is a strictly additive second write that gives the trend something to read.
 * Three rules follow from that, and this module exists so they are testable:
 *
 *   1. The authoritative write goes first and completes before history starts.
 *   2. A failed authoritative write blocks history and fails the save.
 *   3. A failed history write is non-fatal — the weight the user typed is
 *      saved, so telling them the save failed would be a lie.
 *
 * Two more come from the independent review of this cycle:
 *
 *   4. History is written only for a *deliberate* weigh-in. The caller passes
 *      `recordBodyWeightHistory` to say the field actually changed.
 *   5. A save overtaken while its authoritative write was in flight stops
 *      before history and reports `superseded`, so the caller shows no toast.
 *
 * On rule 4, note the exact boundary: `recordBodyWeightHistory: false` skips
 * history; *omitting* it does not. Omission is the pre-review call shape and
 * still logs, which is what `__tests__/save-training-preferences.spec.ts` pins
 * (S4, S6, S9 all omit the flag and require the upsert). The safety property
 * lives at the only caller instead: `app/(app)/profile/training/page.tsx`
 * passes an explicit boolean on every single save, so the omitted case never
 * occurs in production.
 *
 * The persistence adapter and both clock values are injected: no Supabase
 * client, no `new Date()`, no JSX.
 */

import { normalizeTrainingPhase } from '@/lib/workout/complete-workout-persistence';
import type { UserRow } from '@/types/database';
import type { TrainingPhase } from '@/types/training-context';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PersistenceError {
  message: string;
}

export interface PersistenceOutcome {
  error: PersistenceError | null;
}

/** Exactly the columns this screen owns. Phase keys appear only when they change. */
export interface UserPreferencesUpdate {
  training_goals: string[];
  experience_level: UserRow['experience_level'];
  body_weight_kg: number | null;
  preferred_rep_range: { min: number; max: number } | null;
  prefill_sort_heaviest_first: boolean;
  weekly_workout_target: number;
  training_phase?: TrainingPhase;
  training_phase_started_at?: string;
}

/** `id` and `created_at` are the database's — §7.2 declares no other column. */
export interface BodyWeightLogUpsert {
  user_id: string;
  logged_on: string;
  weight_kg: number;
}

export interface TrainingPreferencesAdapter {
  updateUser(userId: string, patch: UserPreferencesUpdate): Promise<PersistenceOutcome>;
  upsertBodyWeightLog(
    row: BodyWeightLogUpsert,
    options: { onConflict: string },
  ): Promise<PersistenceOutcome>;
}

export interface SaveTrainingPreferencesInput {
  userId: string;
  goals: string[];
  experience: UserRow['experience_level'];
  preferredRepRange: { min: number; max: number } | null;
  prefillSortHeaviestFirst: boolean;
  weeklyWorkoutTarget: number;
  unit: 'kg' | 'lb';
  /** Exactly what the user typed, in `unit`. Blank or unusable clears the column. */
  bodyWeight: string;
  /** The user's local calendar day, `YYYY-MM-DD`. The daily upsert key depends on it. */
  loggedOn: string;
  /** ISO timestamp used to stamp a phase change. */
  now: string;
  /** The newly selected phase, if this screen offers one. */
  phase?: TrainingPhase | null;
  /** The phase already stored, so an unchanged phase is not re-stamped. */
  currentPhase?: TrainingPhase | null;
  /**
   * Whether this save is a *weigh-in*, i.e. the caller knows the body-weight
   * field actually changed.
   *
   * The autosave on the profile screen is debounced and re-fires on every
   * unrelated keystroke — a goal toggle, a rep-range edit — while the field
   * still holds yesterday's number. Passing `false` records the authoritative
   * `users.body_weight_kg` as always, but writes no `body_weight_logs` row: a
   * missing reading is a lost signal, a fabricated one is a lie the trend can
   * never distinguish from a real weigh-in.
   *
   * The profile screen passes this explicitly on every save. See the module
   * header for why omitting it is not the same as passing `false`.
   */
  recordBodyWeightHistory?: boolean;
  /**
   * Whether this invocation is still the current one, consulted once the
   * authoritative write has settled and before history is touched.
   *
   * Overlapping autosaves are ordinary here. A save that was overtaken while
   * its `users` write was in flight must not go on to write history, and must
   * tell its caller so the stale toast is suppressed. Returning `false` is not
   * a failure and not a warning — it is "someone newer is in charge".
   */
  isCurrent?: () => boolean;
}

export interface SaveTrainingPreferencesResult {
  ok: boolean;
  bodyWeightLogged: boolean;
  /** Machine-readable and non-fatal. Today: `body_weight_history_unavailable`. */
  warning: string | null;
  error: PersistenceError | null;
  /**
   * This save was overtaken by a newer one before history was written. Neither
   * a success to announce nor a failure to report — the caller shows nothing.
   */
  superseded: boolean;
}

/** The minimal date-like value `localCalendarDay` reads. `Date` satisfies it. */
export interface CalendarDayParts {
  getFullYear(): number;
  getMonth(): number;
  getDate(): number;
}

/** The unique key on `body_weight_logs` — saving twice in a day updates. */
export const BODY_WEIGHT_LOG_CONFLICT_TARGET = 'user_id,logged_on';

const LB_PER_KG = 2.205;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The typed weight as canonical kilograms, or null when it is not a weight.
 * Same parse and same rounding the profile screen has always used.
 */
export function parseBodyWeightKg(bodyWeight: string, unit: 'kg' | 'lb'): number | null {
  if (!bodyWeight.trim()) return null;
  const parsed = parseFloat(bodyWeight);
  if (isNaN(parsed) || parsed <= 0) return null;
  return unit === 'lb' ? Math.round((parsed / LB_PER_KG) * 10) / 10 : parsed;
}

/**
 * A canonical weight as the string the body-weight field should show, in `unit`.
 *
 * The inverse of `parseBodyWeightKg`, and it lives here for that reason. The
 * profile screen used to project kilograms to *whole* pounds itself, while the
 * parse above rounds to a tenth of a kilogram — finer than a whole pound. So
 * loading a profile in pounds and then touching an unrelated field re-parsed
 * the untouched number into a *different* canonical weight (80.1 kg showed as
 * 177 lb and read back as 80.3 kg), and the autosave concluded the user had
 * weighed in. A tenth of a pound resolves ~0.045 kg, comfortably finer than the
 * tenth of a kilogram the column keeps, so this round trip is exact and no
 * comparison tolerance — which would swallow real 0.1 kg weigh-ins — is needed.
 */
export function formatBodyWeightInput(weightKg: number, unit: 'kg' | 'lb'): string {
  if (unit === 'lb') {
    return String(Math.round(weightKg * LB_PER_KG * 10) / 10);
  }
  return String(weightKg);
}

/**
 * The user's *local* calendar day as `YYYY-MM-DD`.
 *
 * `body_weight_logs` is keyed on `(user_id, logged_on)`, so a UTC-derived day
 * would split one evening's weigh-in across two rows for anyone east of
 * Greenwich, or merge two mornings into one for anyone west of it. Local
 * getters and zero padding, nothing else.
 */
export function localCalendarDay(date: CalendarDayParts): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ── Supabase-backed adapter ──────────────────────────────────────────────────

/**
 * The two writes this module is allowed to make, described structurally.
 *
 * Typed against the shape rather than the client so this module stays free of
 * `@/lib/supabase/client` — importing it here would drag a browser client into
 * a pure, Node-testable helper.
 */
export interface TrainingPreferencesWriteResult {
  error: { message: string } | null;
}

export interface TrainingPreferencesUsersBuilder {
  update(patch: UserPreferencesUpdate): {
    eq(column: 'id', value: string): PromiseLike<TrainingPreferencesWriteResult>;
  };
}

export interface TrainingPreferencesBodyWeightLogsBuilder {
  upsert(
    row: BodyWeightLogUpsert,
    options: { onConflict: string },
  ): PromiseLike<TrainingPreferencesWriteResult>;
}

/**
 * One overload per table rather than a `'users' | 'body_weight_logs'`
 * parameter: a real Supabase client resolves its query builder from the
 * relation name, and handing it a union sends that resolution excessively
 * deep. Two single-literal calls are exactly what this module makes anyway.
 */
export interface TrainingPreferencesClient {
  from(table: 'users'): TrainingPreferencesUsersBuilder;
  from(table: 'body_weight_logs'): TrainingPreferencesBodyWeightLogsBuilder;
}

/**
 * Bind the two writes to a Supabase-like client: `users` is addressed by id,
 * `body_weight_logs` by the daily conflict target, which is forwarded verbatim.
 */
export function createTrainingPreferencesAdapter(
  client: TrainingPreferencesClient,
): TrainingPreferencesAdapter {
  return {
    async updateUser(userId: string, patch: UserPreferencesUpdate) {
      const { error } = await client.from('users').update(patch).eq('id', userId);
      return { error: error ? { message: error.message } : null };
    },
    async upsertBodyWeightLog(row: BodyWeightLogUpsert, options: { onConflict: string }) {
      const { error } = await client.from('body_weight_logs').upsert(row, options);
      return { error: error ? { message: error.message } : null };
    },
  };
}

// ── Save ─────────────────────────────────────────────────────────────────────

export async function saveTrainingPreferences(
  adapter: TrainingPreferencesAdapter,
  input: SaveTrainingPreferencesInput,
): Promise<SaveTrainingPreferencesResult> {
  const bodyWeightKg = parseBodyWeightKg(input.bodyWeight, input.unit);

  const patch: UserPreferencesUpdate = {
    training_goals: input.goals,
    experience_level: input.experience,
    body_weight_kg: bodyWeightKg,
    preferred_rep_range: input.preferredRepRange,
    prefill_sort_heaviest_first: input.prefillSortHeaviestFirst,
    weekly_workout_target: input.weeklyWorkoutTarget,
  };

  // An unreadable phase is dropped rather than guessed — it would only fail
  // `chk_training_phase` on arrival.
  const phase = normalizeTrainingPhase(input.phase);
  if (phase) {
    patch.training_phase = phase;
    // The autosave re-fires on every unrelated keystroke. Re-stamping here
    // would reset "how long have I been cutting" each time.
    if (normalizeTrainingPhase(input.currentPhase) !== phase) {
      patch.training_phase_started_at = input.now;
    }
  }

  const userOutcome = await adapter.updateUser(input.userId, patch);
  if (userOutcome.error) {
    return {
      ok: false,
      bodyWeightLogged: false,
      warning: null,
      error: userOutcome.error,
      superseded: false,
    };
  }

  // Consulted here and nowhere else: the authoritative write has landed and is
  // never rolled back, but everything after it belongs to whoever is current.
  if (input.isCurrent && !input.isCurrent()) {
    return { ok: true, bodyWeightLogged: false, warning: null, error: null, superseded: true };
  }

  if (bodyWeightKg === null) {
    return { ok: true, bodyWeightLogged: false, warning: null, error: null, superseded: false };
  }

  // A deliberate weigh-in only. An unrelated preference edit re-fires this save
  // with the same stale number in the field, and logging it would invent a
  // reading the trend cannot tell from a real one.
  if (input.recordBodyWeightHistory === false) {
    return { ok: true, bodyWeightLogged: false, warning: null, error: null, superseded: false };
  }

  const historyOutcome = await adapter.upsertBodyWeightLog(
    {
      user_id: input.userId,
      logged_on: input.loggedOn,
      weight_kg: bodyWeightKg,
    },
    { onConflict: BODY_WEIGHT_LOG_CONFLICT_TARGET },
  );

  if (historyOutcome.error) {
    // The authoritative write landed. The trend simply reports "absent".
    return {
      ok: true,
      bodyWeightLogged: false,
      warning: 'body_weight_history_unavailable',
      error: null,
      superseded: false,
    };
  }

  return { ok: true, bodyWeightLogged: true, warning: null, error: null, superseded: false };
}
