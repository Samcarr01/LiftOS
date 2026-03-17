'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useAuthStore } from '@/store/auth-store';
import type { StartWorkoutResponse, StartWorkoutExercise } from '@/types/app';
import type {
  ExerciseRow,
  SessionExerciseRow,
  TemplateExerciseRow,
  WorkoutSessionRow,
} from '@/types/database';
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

interface RawTemplateExercise extends TemplateExerciseRow {
  exercise: ExerciseRow;
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

function buildPrefilledSets(
  count: number,
  lastPerformance: LastPerformanceSet[] | null,
): PrefilledSet[] {
  if (lastPerformance && lastPerformance.length > 0) {
    return Array.from({ length: count }, (_, index) => {
      const source = lastPerformance[index] ?? lastPerformance[lastPerformance.length - 1];
      return {
        setIndex: index,
        values: source.values,
        setType: source.set_type,
      };
    });
  }

  return Array.from({ length: count }, (_, index) => ({
    setIndex: index,
    values: {},
    setType: 'working',
  }));
}

export function useStartWorkout() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrateWorkout = useActiveWorkoutStore((s) => s.hydrateWorkout);

  async function startWorkout(templateId: string | null) {
    const supabase = createClient();
    try {
      if (!user) throw new Error('Please sign in again.');

      let templateExercises: RawTemplateExercise[] = [];
      if (templateId) {
        const { data, error } = await supabase
          .from('template_exercises')
          .select('*, exercise:exercises(*)')
          .eq('template_id', templateId)
          .order('order_index', { ascending: true }) as {
          data: RawTemplateExercise[] | null;
          error: unknown;
        };

        if (error) throw error;
        templateExercises = data ?? [];
      }

      const exerciseIds = templateExercises.map((exercise) => exercise.exercise_id);

      const [{ data: lastPerformanceRows, error: lastPerformanceError }, { data: suggestionRows, error: suggestionError }] =
        exerciseIds.length > 0
          ? await Promise.all([
              supabase
                .from('last_performance_snapshots')
                .select('exercise_id, sets_data')
                .eq('user_id', user.id)
                .in('exercise_id', exerciseIds),
              supabase
                .from('ai_suggestions')
                .select('exercise_id, suggestion_data')
                .eq('user_id', user.id)
                .in('exercise_id', exerciseIds)
                .gt('expires_at', new Date().toISOString()),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
            ];

      if (lastPerformanceError) throw lastPerformanceError;
      if (suggestionError) throw suggestionError;

      const { data: session, error: sessionError } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: user.id,
          template_id: templateId,
          started_at: new Date().toISOString(),
        })
        .select()
        .single() as { data: WorkoutSessionRow | null; error: unknown };

      if (sessionError || !session) {
        throw sessionError ?? new Error('Failed to create workout session');
      }

      const sessionExercisesToInsert = templateExercises.map((exercise) => ({
        session_id: session.id,
        exercise_id: exercise.exercise_id,
        order_index: exercise.order_index,
        rest_seconds: exercise.rest_seconds,
        superset_group_id: exercise.superset_group_id,
        notes: exercise.notes,
      }));

      const insertedSessionExercises = sessionExercisesToInsert.length > 0
        ? await supabase
            .from('session_exercises')
            .insert(sessionExercisesToInsert)
            .select() as { data: SessionExerciseRow[] | null; error: unknown }
        : { data: [], error: null };

      if (insertedSessionExercises.error) throw insertedSessionExercises.error;

      const sessionExerciseByOrder = new Map(
        (insertedSessionExercises.data ?? []).map((exercise) => [exercise.order_index, exercise]),
      );

      const lastPerformanceByExercise = new Map<string, LastPerformanceSet[] | null>(
        (lastPerformanceRows ?? []).map((row) => [
          row.exercise_id,
          parseLastPerformance(
            Array.isArray(row.sets_data) ? row.sets_data : null,
          ),
        ]),
      );

      const suggestionByExercise = new Map<string, AISuggestionData | null>(
        (suggestionRows ?? []).map((row) => [
          row.exercise_id,
          parseAiSuggestion(row.suggestion_data),
        ]),
      );

      const response: StartWorkoutResponse = {
        session,
        exercises: templateExercises.map((templateExercise): StartWorkoutExercise => {
          const lastPerformance =
            lastPerformanceByExercise.get(templateExercise.exercise_id) ?? null;

          return {
            sessionExercise: sessionExerciseByOrder.get(templateExercise.order_index)!,
            exercise: parseExercise(templateExercise.exercise as unknown as Record<string, unknown>),
            lastPerformance,
            aiSuggestion: suggestionByExercise.get(templateExercise.exercise_id) ?? null,
            prefilledSets: buildPrefilledSets(
              templateExercise.default_set_count ?? 3,
              lastPerformance,
            ),
          };
        }),
      };

      hydrateWorkout(response);
      router.push(`/workout/${response.session.id}`);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to start workout';
      toast.error(msg);
    }
  }

  return { startWorkout };
}
