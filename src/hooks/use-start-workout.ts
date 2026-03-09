/**
 * useStartWorkout — calls the start-workout Edge Function and hydrates
 * the active-workout-store with the response.
 *
 * Usage:
 *   const { startWorkout, isLoading, error } = useStartWorkout();
 *   await startWorkout(templateId);     // then navigate to the workout screen
 */

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { TrackingSchemaValidator } from '@/lib/validation';
import { AISuggestionDataSchema } from '@/lib/validation';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { Analytics } from '@/lib/analytics';
import type { StartWorkoutResponse, StartWorkoutExercise, ExerciseWithSchema } from '@/types';
import type { SessionExerciseRow } from '@/types/database';

// ── Raw shape returned by the Edge Function (snake_case) ──────────────────────

interface RawExercise {
  id: string;
  user_id: string;
  name: string;
  muscle_groups: string[];
  tracking_schema: unknown;
  unit_config: import('@/types/database').Json;
  default_rest_seconds: number;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface RawLastPerfSet {
  set_index: number;
  values: Record<string, number | string>;
  set_type?: string;
}

interface RawPrefilledSet {
  set_index: number;
  values: Record<string, number | string>;
  set_type: string;
}

interface RawWorkoutExercise {
  session_exercise: SessionExerciseRow;
  exercise: RawExercise;
  last_performance: RawLastPerfSet[] | null;
  ai_suggestion: unknown;
  prefilled_sets: RawPrefilledSet[];
}

interface EdgeFunctionPayload {
  session: StartWorkoutResponse['session'];
  exercises: RawWorkoutExercise[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStartWorkout() {
  const { isLoading, error, setLoading, setError, hydrateWorkout } =
    useActiveWorkoutStore((s) => ({
      isLoading: s.isLoading,
      error: s.error,
      setLoading: s.setLoading,
      setError: s.setError,
      hydrateWorkout: s.hydrateWorkout,
    }));

  const startWorkout = useCallback(
    async (templateId: string | null): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const { data: raw, error: fnError } = await supabase.functions.invoke<{
          data: EdgeFunctionPayload;
          error?: string;
        }>('start-workout', {
          body: { template_id: templateId },
        });

        if (fnError) throw new Error(fnError.message);
        if (!raw?.data) throw new Error('Empty response from start-workout');

        const payload = raw.data;

        // ── Parse and validate each exercise ─────────────────────────────────
        const exercises: StartWorkoutExercise[] = [];

        for (const rawEx of payload.exercises) {
          // Parse tracking_schema with Zod
          const schemaResult = TrackingSchemaValidator.safeParse(rawEx.exercise.tracking_schema);
          if (!schemaResult.success) {
            console.warn(`[start-workout] Invalid tracking_schema for exercise ${rawEx.exercise.id}`, schemaResult.error);
            continue; // skip corrupted exercise rather than crashing
          }

          const exercise: ExerciseWithSchema = {
            ...rawEx.exercise,
            tracking_schema: schemaResult.data,
          };

          // Parse ai_suggestion (optional, don't crash if malformed)
          let aiSuggestion: StartWorkoutExercise['aiSuggestion'] = null;
          if (rawEx.ai_suggestion) {
            const aiResult = AISuggestionDataSchema.safeParse(rawEx.ai_suggestion);
            if (aiResult.success) aiSuggestion = aiResult.data;
          }

          // Normalise last_performance
          const lastPerformance = rawEx.last_performance
            ? rawEx.last_performance.map((lp) => ({
                set_index: lp.set_index,
                values: lp.values,
                set_type: (lp.set_type ?? 'working') as 'warmup' | 'working' | 'top' | 'drop' | 'failure',
              }))
            : null;

          // Normalise prefilled_sets
          const prefilledSets = rawEx.prefilled_sets.map((ps) => ({
            setIndex: ps.set_index,
            values: ps.values,
            setType: (ps.set_type ?? 'working') as 'warmup' | 'working' | 'top' | 'drop' | 'failure',
          }));

          exercises.push({
            sessionExercise: rawEx.session_exercise,
            exercise,
            lastPerformance,
            aiSuggestion,
            prefilledSets,
          });
        }

        // ── Hydrate the store ─────────────────────────────────────────────────
        hydrateWorkout({ session: payload.session, exercises });
        Analytics.workoutStarted({
          template_id:     templateId,
          exercise_count:  exercises.length,
        });
        return true;
      } catch (err: unknown) {
        const message = (err as { message?: string }).message ?? 'Failed to start workout';
        setError(message);
        return false;
      }
    },
    [setLoading, setError, hydrateWorkout],
  );

  return { startWorkout, isLoading, error };
}
