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
  return Array.from({ length: count }, (_, index) => {
    const lastSet = lastPerformance?.find((s) => s.set_index === index);
    return {
      setIndex: index,
      values: lastSet?.values ?? {},
      setType: (lastSet?.set_type as PrefilledSet['setType']) ?? 'working',
    };
  });
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
      let templateName: string | null = null;
      if (templateId) {
        const [templateResult, exercisesResult] = await Promise.all([
          supabase
            .from('workout_templates')
            .select('name')
            .eq('id', templateId)
            .single(),
          supabase
            .from('template_exercises')
            .select('*, exercise:exercises(*)')
            .eq('template_id', templateId)
            .order('order_index', { ascending: true }) as unknown as Promise<{
            data: RawTemplateExercise[] | null;
            error: unknown;
          }>,
        ]);

        if (exercisesResult.error) throw exercisesResult.error;
        templateExercises = exercisesResult.data ?? [];
        templateName = templateResult.data?.name ?? null;
      }

      const exerciseIds = templateExercises.map((exercise) => exercise.exercise_id);

      // Generate IDs client-side so the write chain (insert session → insert
      // session_exercises) can race with the read branch (snapshots + suggestions)
      // instead of waiting for the writes to return their generated IDs.
      const sessionId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      const sessionExercisesToInsert: SessionExerciseRow[] = templateExercises.map((exercise) => ({
        id: crypto.randomUUID(),
        session_id: sessionId,
        exercise_id: exercise.exercise_id,
        order_index: exercise.order_index,
        rest_seconds: exercise.rest_seconds,
        superset_group_id: exercise.superset_group_id,
        notes: exercise.notes,
      }));

      const readBranch: Promise<{
        lastPerformanceRows: { exercise_id: string; sets_data: unknown }[];
        suggestionRows:      { exercise_id: string; suggestion_data: unknown }[];
      }> = exerciseIds.length > 0
        ? (async () => {
            const [lp, sg] = await Promise.all([
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
            ]);
            if (lp.error) throw lp.error;
            if (sg.error) throw sg.error;
            return {
              lastPerformanceRows: lp.data ?? [],
              suggestionRows:      sg.data ?? [],
            };
          })()
        : Promise.resolve({ lastPerformanceRows: [], suggestionRows: [] });

      const writeBranch = (async (): Promise<WorkoutSessionRow> => {
        const { data: session, error: sessionError } = await supabase
          .from('workout_sessions')
          .insert({
            id: sessionId,
            user_id: user.id,
            template_id: templateId,
            template_name: templateName,
            started_at: startedAt,
          })
          .select()
          .single() as { data: WorkoutSessionRow | null; error: unknown };

        if (sessionError || !session) {
          throw sessionError ?? new Error('Failed to create workout session');
        }

        if (sessionExercisesToInsert.length > 0) {
          const { error: seError } = await supabase
            .from('session_exercises')
            .insert(sessionExercisesToInsert);
          if (seError) throw seError;
        }

        return session;
      })();

      const [{ lastPerformanceRows, suggestionRows }, session] = await Promise.all([readBranch, writeBranch]);

      const sessionExerciseByOrder = new Map(
        sessionExercisesToInsert.map((exercise) => [exercise.order_index, exercise]),
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
