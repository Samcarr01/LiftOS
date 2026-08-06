/**
 * Pure row builders for workout completion. Cut-Aware Progression v1, §10.1.
 *
 * The completion route owns transactions, auth and ordering; this module owns
 * *shape*. Nothing here touches Supabase, the network or the clock, so the
 * rules that matter — every upsert row carries the same keys, optional context
 * degrades to NULL instead of failing a save, and a phase is never invented —
 * are testable without a database.
 *
 * The normalizers are deliberately paranoid. `training_phase` defaults to
 * `build` in Postgres, and that default is the database's to apply: if a
 * preferences read fails or returns junk, a cutting lifter must not silently
 * receive Build thresholds.
 */

import { ReadinessSchema, RirSchema, TrainingPhaseSchema } from '@/lib/validation';
import type { SetType, SetValues } from '@/types/app';
import type { Json } from '@/types/database';
import type { Readiness, TrainingPhase } from '@/types/training-context';

// ── Types ────────────────────────────────────────────────────────────────────

/** A set as it arrives in the completion payload, RIR included or not. */
export interface SetEntryUpsertSet {
  setIndex: number;
  values: SetValues;
  setType: SetType;
  isCompleted: boolean;
  notes?: string | null;
  loggedAt?: string | null;
  rir?: number | null;
}

export interface SetEntryUpsertInput {
  sessionExerciseId: string;
  sets: SetEntryUpsertSet[];
}

/** One `set_entries` row. Every key is always present — see `buildSetEntryUpsertRows`. */
export interface SetEntryUpsertRow {
  session_exercise_id: string;
  set_index: number;
  values: Json;
  set_type: SetType;
  is_completed: boolean;
  notes: string | null;
  rir: number | null;
}

export interface SessionCompletionPatchInput {
  completedAt: string;
  durationSeconds: number;
  isLightSession: boolean;
  readiness?: Readiness | null;
  phaseAtSession?: TrainingPhase | null;
}

export interface SessionCompletionPatch {
  completed_at: string;
  duration_seconds: number;
  is_light_session: boolean;
  readiness: Readiness | null;
  phase_at_session: TrainingPhase | null;
}

// ── Normalizers ──────────────────────────────────────────────────────────────

/** `high | normal | low | very_low`, or null. Free text is never mapped onto a level. */
export function normalizeReadiness(value: unknown): Readiness | null {
  const parsed = ReadinessSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** `build | maintain | cut`, or null. Never fabricates the database default. */
export function normalizeTrainingPhase(value: unknown): TrainingPhase | null {
  const parsed = TrainingPhaseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** An integer 0…3, or null. Absence is not RIR 0. */
export function normalizeRir(value: unknown): number | null {
  const parsed = RirSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ── Builders ─────────────────────────────────────────────────────────────────

/**
 * Flatten the payload into `set_entries` rows.
 *
 * Every row carries an identical key set. PostgREST derives the column list of
 * a bulk upsert from the first row, so a heterogeneous batch would silently
 * drop `rir` for the whole request whenever the first set happened to omit it.
 */
export function buildSetEntryUpsertRows(exercises: SetEntryUpsertInput[]): SetEntryUpsertRow[] {
  return exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      session_exercise_id: exercise.sessionExerciseId,
      set_index: set.setIndex,
      values: set.values as Json,
      set_type: set.setType,
      is_completed: set.isCompleted,
      notes: set.notes ?? null,
      rir: normalizeRir(set.rir),
    })),
  );
}

/**
 * The single `workout_sessions` update that completes a session.
 *
 * The three existing completion fields keep their exact semantics; readiness
 * and the phase snapshot ride along as nullable context so the completion
 * stays one statement, one write, one ordering.
 */
export function buildSessionCompletionPatch(input: SessionCompletionPatchInput): SessionCompletionPatch {
  return {
    completed_at: input.completedAt,
    duration_seconds: input.durationSeconds,
    is_light_session: input.isLightSession,
    readiness: normalizeReadiness(input.readiness),
    phase_at_session: normalizeTrainingPhase(input.phaseAtSession),
  };
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * The three writes and one selector the completion sequence needs. The route
 * supplies Supabase-backed versions; a test supplies four-line fakes. `TContext`
 * is whatever the route derives once the sets have landed — this module treats
 * it as opaque and hands it straight back.
 */
export interface WorkoutCompletionDeps<TContext> {
  saveSetEntries(rows: SetEntryUpsertRow[]): Promise<void>;
  /**
   * The completion clock, read once — see `persistWorkoutCompletion` for where.
   * Injected rather than called here so the ordering is observable in a test
   * and this module keeps its "no clock, no network" property.
   */
  now(): string;
  /** Handed the same instant that will be stamped, so the summary agrees with it. */
  loadPostSaveContext(completedAt: string): Promise<TContext>;
  durationSeconds(context: TContext): number;
  completeSession(patch: SessionCompletionPatch): Promise<void>;
}

export interface WorkoutCompletionInput {
  exercises: SetEntryUpsertInput[];
  /** Every `session_exercises.id` the session actually owns, read from the server. */
  ownedSessionExerciseIds: Iterable<string>;
  isLightSession: boolean;
  /**
   * Deliberately `unknown`: readiness is whatever the client sent, and the
   * phase is whatever the server managed to read. Both are normalised here, so
   * neither can reach a CHECK constraint — or cost the user their workout.
   */
  readiness?: unknown;
  phaseAtSession?: unknown;
}

export interface WorkoutCompletionResult<TContext> {
  /** The loader's own value, by identity. */
  context: TContext;
  /** Exactly the patch that was written. */
  patch: SessionCompletionPatch;
}

/**
 * Complete a workout: check ownership, write the sets, derive the post-save
 * context, then mark the session complete — in that order and no other.
 *
 * Ownership first, because RLS on `set_entries` is inherited through
 * `session_exercises`: the payload is the only place a row aimed at another
 * session's exercise can be caught, and it has to be caught before a write.
 *
 * Then sets, then context, then completion. Deriving the summary before the
 * sets land would total stale rows and stamp `duration_seconds` off them;
 * completing before they land would leave a finished workout missing sets.
 *
 * The clock is read between the set write and the context load, which is where
 * the route read it before this module existed. A stamp taken earlier — by the
 * caller, before dispatch — would report a workout that ended before its last
 * set was saved, and would shorten every recorded session by the write's own
 * latency. The one reading is both stamped as `completed_at` and handed to the
 * loader, so `duration_seconds` is measured to exactly the instant written.
 *
 * Nothing here touches Supabase, and every failure propagates unchanged so the
 * route's existing error handling keeps working.
 */
export async function persistWorkoutCompletion<TContext>(
  deps: WorkoutCompletionDeps<TContext>,
  input: WorkoutCompletionInput,
): Promise<WorkoutCompletionResult<TContext>> {
  const owned = new Set(input.ownedSessionExerciseIds);
  for (const exercise of input.exercises) {
    if (!owned.has(exercise.sessionExerciseId)) {
      throw new Error('Workout payload included an exercise that does not belong to this session.');
    }
  }

  const rows = buildSetEntryUpsertRows(input.exercises);
  if (rows.length > 0) {
    await deps.saveSetEntries(rows);
  }

  const completedAt = deps.now();

  const context = await deps.loadPostSaveContext(completedAt);

  const patch = buildSessionCompletionPatch({
    completedAt,
    durationSeconds: deps.durationSeconds(context),
    isLightSession: input.isLightSession,
    readiness: normalizeReadiness(input.readiness),
    phaseAtSession: normalizeTrainingPhase(input.phaseAtSession),
  });

  await deps.completeSession(patch);

  return { context, patch };
}
