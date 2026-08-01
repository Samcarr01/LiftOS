import type { SupabaseClient } from '@supabase/supabase-js';
import type { SetValues } from '@/types/app';
import type { ProgressHistorySession } from './guided-progression';
import type { Json } from '@/types/database';

/**
 * Load all completed (non-light) history sessions for an exercise.
 * Sorted newest-first.
 */
export async function loadHistorySessions(
  supabase: SupabaseClient,
  exerciseId: string,
): Promise<ProgressHistorySession[]> {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(`
      session_id,
      exercise_id,
      workout_sessions!inner (
        completed_at,
        is_light_session
      ),
      set_entries (
        set_index,
        values,
        set_type,
        is_completed,
        logged_at
      )
    `)
    .eq('exercise_id', exerciseId)
    .not('workout_sessions.completed_at', 'is', null);

  if (error) throw error;

  const historyRows = (data ?? []) as unknown as Array<{
    session_id: string;
    exercise_id: string;
    workout_sessions: { completed_at: string; is_light_session: boolean } | { completed_at: string; is_light_session: boolean }[] | null;
    set_entries: Array<{
      set_index: number;
      values: Json;
      set_type: string;
      is_completed: boolean;
      logged_at: string | null;
    }>;
  }>;

  return historyRows
    .map((row) => ({
      ...row,
      workoutSession: Array.isArray(row.workout_sessions)
        ? row.workout_sessions[0] ?? null
        : row.workout_sessions,
    }))
    .filter((row) => row.workoutSession && !row.workoutSession.is_light_session)
    .map((row) => ({
      sessionId: row.session_id,
      completedAt: row.workoutSession!.completed_at,
      sets: (row.set_entries ?? []).map((set) => ({
        set_index: set.set_index,
        values: set.values as SetValues,
        set_type: set.set_type,
        is_completed: set.is_completed,
        logged_at: set.logged_at,
      })),
    }))
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}
