import type { SupabaseClient } from '@supabase/supabase-js';
import type { SetValues } from '@/types/app';
import type { ProgressHistorySession } from './guided-progression';
import type { ObservationSession } from './observation';
import type { SessionContext } from './interpretation';
import { normalizeReadiness, normalizeRir, normalizeTrainingPhase } from './complete-workout-persistence';
import type { Json } from '@/types/database';

// ── Types ────────────────────────────────────────────────────────────────────

/** The embedded parent row. PostgREST returns it as an object or a one-element array. */
export interface HistorySessionEmbed {
  completed_at: string;
  is_light_session: boolean;
  readiness?: string | null;
  phase_at_session?: string | null;
}

export interface HistorySetRow {
  set_index: number;
  values: Json;
  set_type: string;
  is_completed: boolean;
  logged_at: string | null;
  rir?: number | null;
}

/** One `session_exercises` row with its parent session and its sets. */
export interface HistoryRow {
  session_id: string;
  exercise_id: string;
  workout_sessions: HistorySessionEmbed | HistorySessionEmbed[] | null;
  set_entries: HistorySetRow[];
}

/**
 * The three views of the same history, all newest-first and all the same
 * length. `sessions` is byte-for-byte what every existing caller already gets.
 */
export interface HistoryContextResult {
  sessions: ProgressHistorySession[];
  observationSessions: ObservationSession[];
  contexts: SessionContext[];
}

/** The loader's only dependency: something that can produce rows for an exercise. */
export type HistoryRowFetcher = (exerciseId: string) => Promise<HistoryRow[]>;

// ── Pure mapping ─────────────────────────────────────────────────────────────

/**
 * Turn raw rows into engine input.
 *
 * Light sessions and rows with no parent session are dropped, exactly as
 * before. Context binds by `sessionId` and is emitted in the same newest-first
 * order as the sessions themselves, so no session can ever be handed another
 * session's readiness.
 */
export function mapHistoryRows(rows: HistoryRow[]): HistoryContextResult {
  const entries = rows
    .map((row) => ({
      row,
      workoutSession: Array.isArray(row.workout_sessions)
        ? row.workout_sessions[0] ?? null
        : row.workout_sessions,
    }))
    .filter((entry) => entry.workoutSession && !entry.workoutSession.is_light_session)
    .map((entry) => {
      const workoutSession = entry.workoutSession!;
      const setRows = entry.row.set_entries ?? [];

      return {
        session: {
          sessionId: entry.row.session_id,
          completedAt: workoutSession.completed_at,
          sets: setRows.map((set) => ({
            set_index: set.set_index,
            values: set.values as SetValues,
            set_type: set.set_type,
            is_completed: set.is_completed,
            logged_at: set.logged_at,
          })),
        } satisfies ProgressHistorySession,
        observationSession: {
          sessionId: entry.row.session_id,
          completedAt: workoutSession.completed_at,
          sets: setRows.map((set) => ({
            set_index: set.set_index,
            values: set.values as SetValues,
            set_type: set.set_type,
            is_completed: set.is_completed,
            logged_at: set.logged_at,
            rir: normalizeRir(set.rir),
          })),
        } satisfies ObservationSession,
        context: {
          sessionId: entry.row.session_id,
          readiness: normalizeReadiness(workoutSession.readiness),
          phaseAtSession: normalizeTrainingPhase(workoutSession.phase_at_session),
          isLightSession: workoutSession.is_light_session,
        } satisfies SessionContext,
      };
    })
    .sort((a, b) =>
      new Date(b.session.completedAt).getTime() - new Date(a.session.completedAt).getTime(),
    );

  return {
    sessions: entries.map((entry) => entry.session),
    observationSessions: entries.map((entry) => entry.observationSession),
    contexts: entries.map((entry) => entry.context),
  };
}

// ── Loading ──────────────────────────────────────────────────────────────────

/** Fetch rows, then map them. One injectable seam, so tests need no client. */
export async function loadHistorySessionsWithContext(
  fetchRows: HistoryRowFetcher,
  exerciseId: string,
): Promise<HistoryContextResult> {
  return mapHistoryRows(await fetchRows(exerciseId));
}

function createHistoryRowFetcher(supabase: SupabaseClient): HistoryRowFetcher {
  return async (exerciseId: string) => {
    const { data, error } = await supabase
      .from('session_exercises')
      .select(`
        session_id,
        exercise_id,
        workout_sessions!inner (
          completed_at,
          is_light_session,
          readiness,
          phase_at_session
        ),
        set_entries (
          set_index,
          values,
          set_type,
          is_completed,
          logged_at,
          rir
        )
      `)
      .eq('exercise_id', exerciseId)
      .not('workout_sessions.completed_at', 'is', null);

    if (error) throw error;

    return (data ?? []) as unknown as HistoryRow[];
  };
}

/**
 * Load all completed (non-light) history sessions for an exercise.
 * Sorted newest-first.
 *
 * Unchanged contract: the per-session context now travels beside these rows,
 * but every existing caller keeps receiving exactly this array.
 */
export async function loadHistorySessions(
  supabase: SupabaseClient,
  exerciseId: string,
): Promise<ProgressHistorySession[]> {
  const { sessions } = await loadHistorySessionsWithContext(
    createHistoryRowFetcher(supabase),
    exerciseId,
  );
  return sessions;
}
