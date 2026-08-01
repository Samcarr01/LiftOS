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

/** Parse history_snapshot provenance to verify suggestion freshness */
function parseHistorySnapshotProvenance(raw: unknown): { sourceSessionId: string; schemaVersion: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const sourceSessionId = obj['source_session_id'];
  const schemaVersion = obj['schema_version'];
  if (typeof sourceSessionId === 'string' && typeof schemaVersion === 'number') {
    return { sourceSessionId, schemaVersion };
  }
  return null;
}

/**
 * Check if a cached AI suggestion is still valid.
 * A suggestion is stale if:
 * - It lacks schema_version 2 provenance (legacy)
 * - Its source_session_id doesn't match the current snapshot session_id
 */
function isSuggestionFresh(
  historySnapshot: unknown,
  snapshotSessionId: string | null,
): boolean {
  if (!snapshotSessionId) return false;
  const provenance = parseHistorySnapshotProvenance(historySnapshot);
  if (!provenance) return false;
  return provenance.schemaVersion === 2 && provenance.sourceSessionId === snapshotSessionId;
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

// Heaviest-set-first prefill ordering. Pure function over the snapshot — never
// touches saved sessions or workout/exercise order. Warmups remain leading in
// their original order; everything else is sorted by weight DESC, reps DESC.
// set_index is reassigned positionally so buildPrefilledSets (which looks up by
// set_index) consumes the new order with no further changes.
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : -Infinity;
  }
  return -Infinity;
}

function sortLastPerformanceForPrefill(
  sets: LastPerformanceSet[] | null,
  heaviestFirst: boolean,
): LastPerformanceSet[] | null {
  if (!sets || !heaviestFirst || sets.length < 2) return sets;

  const sample = sets.find((s) => Object.keys(s.values).length > 0);
  if (!sample) return sets;
  const weightKey: 'weight' | 'added_weight' | null =
    'weight' in sample.values ? 'weight'
    : 'added_weight' in sample.values ? 'added_weight'
    : null;
  if (!weightKey) return sets;

  const repsKey = 'reps' in sample.values ? 'reps' : null;

  const warmups = sets.filter((s) => s.set_type === 'warmup');
  const others = sets
    .filter((s) => s.set_type !== 'warmup')
    .sort((a, b) => {
      const diff = num(b.values[weightKey]) - num(a.values[weightKey]);
      if (diff !== 0) return diff;
      if (repsKey) return num(b.values[repsKey]) - num(a.values[repsKey]);
      return 0;
    });

  return [...warmups, ...others].map((s, i) => ({ ...s, set_index: i }));
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
        lastPerformanceRows: { exercise_id: string; sets_data: unknown; session_id: string | null }[];
        suggestionRows:      { exercise_id: string; suggestion_data: unknown; history_snapshot: unknown }[];
        heaviestFirst:       boolean;
      }> = exerciseIds.length > 0
        ? (async () => {
            const [lp, sg, prefRow] = await Promise.all([
              supabase
                .from('last_performance_snapshots')
                .select('exercise_id, sets_data, session_id')
                .eq('user_id', user.id)
                .in('exercise_id', exerciseIds),
              supabase
                .from('ai_suggestions')
                .select('exercise_id, suggestion_data, history_snapshot')
                .eq('user_id', user.id)
                .in('exercise_id', exerciseIds)
                .gt('expires_at', new Date().toISOString()),
              supabase
                .from('users')
                .select('prefill_sort_heaviest_first')
                .eq('id', user.id)
                .single(),
            ]);
            if (lp.error) throw lp.error;
            if (sg.error) throw sg.error;
            return {
              lastPerformanceRows: lp.data ?? [],
              suggestionRows:      sg.data ?? [],
              heaviestFirst:       (prefRow.data as { prefill_sort_heaviest_first?: boolean } | null)
                                     ?.prefill_sort_heaviest_first ?? false,
            };
          })()
        : Promise.resolve({ lastPerformanceRows: [], suggestionRows: [], heaviestFirst: false });

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

      const [{ lastPerformanceRows, suggestionRows, heaviestFirst }, session] = await Promise.all([readBranch, writeBranch]);

      const sessionExerciseByOrder = new Map(
        sessionExercisesToInsert.map((exercise) => [exercise.order_index, exercise]),
      );

      const lastPerformanceByExercise = new Map<string, { sets: LastPerformanceSet[] | null; sessionId: string | null }>(
        (lastPerformanceRows ?? []).map((row) => [
          row.exercise_id,
          {
            sets: parseLastPerformance(Array.isArray(row.sets_data) ? row.sets_data : null),
            sessionId: row.session_id,
          },
        ]),
      );

      // Build suggestion map with stale-guard: only include suggestions whose
      // provenance matches the current snapshot session_id
      const suggestionByExercise = new Map<string, AISuggestionData | null>(
        (suggestionRows ?? []).map((row) => {
          const snapshotSessionId = lastPerformanceByExercise.get(row.exercise_id)?.sessionId ?? null;
          const isFresh = isSuggestionFresh(row.history_snapshot, snapshotSessionId);
          return [
            row.exercise_id,
            isFresh ? parseAiSuggestion(row.suggestion_data) : null,
          ];
        }),
      );

      const response: StartWorkoutResponse = {
        session,
        exercises: templateExercises.map((templateExercise): StartWorkoutExercise => {
          const lpEntry = lastPerformanceByExercise.get(templateExercise.exercise_id);
          const rawLast = lpEntry?.sets ?? null;
          // Sort once; reuse the same array for both the "was XX" hint mapping
          // and prefilled-set construction so they stay in lockstep.
          const lastPerformance = sortLastPerformanceForPrefill(rawLast, heaviestFirst);

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
