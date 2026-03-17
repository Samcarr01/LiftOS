'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import type { StartWorkoutResponse, StartWorkoutExercise } from '@/types/app';
import type { WorkoutSessionRow, SessionExerciseRow } from '@/types/database';
import { AISuggestionDataSchema, LastPerformanceSetsDataSchema } from '@/lib/validation';
import { TrackingSchemaValidator } from '@/lib/validation';
import type { ExerciseWithSchema, PrefilledSet, AISuggestionData, LastPerformanceSet } from '@/types/app';

// The Edge Function returns snake_case (per Claude-api.md spec).
// We map to camelCase here before hydrating the store.

interface RawExerciseResponse {
  session_exercise: SessionExerciseRow;
  exercise:         Record<string, unknown>;
  last_performance: unknown[] | null;
  ai_suggestion:    unknown | null;
  prefilled_sets:   Array<{ set_index: number; values: Record<string, number | string>; set_type: string }>;
}

interface RawStartWorkoutResponse {
  session:   WorkoutSessionRow;
  exercises: RawExerciseResponse[];
}

function parseExercise(raw: Record<string, unknown>): ExerciseWithSchema {
  const schema = TrackingSchemaValidator.parse(raw['tracking_schema']);
  return {
    ...(raw as unknown as Omit<ExerciseWithSchema, 'tracking_schema'>),
    tracking_schema: schema,
  };
}

function parseAiSuggestion(raw: unknown): AISuggestionData | null {
  if (!raw) return null;
  const result = AISuggestionDataSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function parseLastPerformance(raw: unknown[] | null): LastPerformanceSet[] | null {
  if (!raw) return null;
  const result = LastPerformanceSetsDataSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function mapResponse(raw: RawStartWorkoutResponse): StartWorkoutResponse {
  const exercises: StartWorkoutExercise[] = raw.exercises.map((ex) => ({
    sessionExercise: ex.session_exercise,
    exercise:        parseExercise(ex.exercise),
    lastPerformance: parseLastPerformance(ex.last_performance),
    aiSuggestion:    parseAiSuggestion(ex.ai_suggestion),
    prefilledSets:   (ex.prefilled_sets ?? []).map((ps): PrefilledSet => ({
      setIndex: ps.set_index,
      values:   ps.values,
      setType:  ps.set_type as PrefilledSet['setType'],
    })),
  }));
  return { session: raw.session, exercises };
}

export function useStartWorkout() {
  const router = useRouter();
  const hydrateWorkout = useActiveWorkoutStore((s) => s.hydrateWorkout);

  async function startWorkout(templateId: string | null) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase.functions.invoke('start-workout', {
        body: { template_id: templateId },
      });

      if (error) throw error;
      if (!data) throw new Error('Empty response from start-workout');

      const response = mapResponse(data as RawStartWorkoutResponse);
      hydrateWorkout(response);
      router.push(`/workout/${response.session.id}`);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to start workout';
      toast.error(msg);
    }
  }

  return { startWorkout };
}
