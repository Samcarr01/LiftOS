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
import { LastPerformanceSetsDataSchema } from '@/lib/validation';
import { TrackingSchemaValidator } from '@/lib/validation';
import { buildGuidedSuggestion, type ProgressHistorySession } from '@/lib/workout/guided-progression';
import { loadHistorySessions } from '@/lib/workout/load-history';
import { buildPrefilledSets, sortLastPerformanceForPrefill } from '@/lib/workout/prefill-sort';
import type { ExerciseWithSchema, PrefilledSet, LastPerformanceSet, UnitPreference } from '@/types/app';

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

function parseLastPerformance(raw: unknown[] | null): LastPerformanceSet[] | null {
  if (!raw) return null;
  const result = LastPerformanceSetsDataSchema.safeParse(raw);
  return result.success ? result.data : null;
}


// ── Heaviest-set-first prefill ordering ────────────────────────────────────────
// Pure function over the snapshot — never touches saved sessions or
// workout/exercise order. Warmups remain leading in their original order;
// everything else is sorted by weight DESC, reps DESC. set_index is
// reassigned positionally so buildPrefilledSets (which looks up by
// set_index) consumes the new order with no further changes.
// sortLastPerformanceForPrefill lives in prefill-sort.ts — imported above.

export function useStartWorkout() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrateWorkout = useActiveWorkoutStore((s) => s.hydrateWorkout);
  const applyPrefillAndSuggestions = useActiveWorkoutStore((s) => s.applyPrefillAndSuggestions);

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
        heaviestFirst:       boolean;
        unitPreference:      UnitPreference;
        trainingGoals:       string[];
        experienceLevel:     string;
        preferredRepRange:   { min: number; max: number } | null;
        historySessionsByExercise: Map<string, ProgressHistorySession[]>;
      }> = exerciseIds.length > 0
        ? (async () => {
            const [lp, prefRow, historyEntries] = await Promise.all([
              supabase
                .from('last_performance_snapshots')
                .select('exercise_id, sets_data')
                .eq('user_id', user.id)
                .in('exercise_id', exerciseIds),
              supabase
                .from('users')
                .select('prefill_sort_heaviest_first, unit_preference, training_goals, experience_level, preferred_rep_range')
                .eq('id', user.id)
                .single(),
              Promise.all(exerciseIds.map(async (exerciseId) => ([
                exerciseId,
                await loadHistorySessions(supabase, exerciseId),
              ] as const))),
            ]);
            if (lp.error) throw lp.error;
            if (prefRow.error) throw prefRow.error;
            const preferences = prefRow.data as {
              prefill_sort_heaviest_first?: boolean;
              unit_preference?: UnitPreference;
              training_goals?: string[];
              experience_level?: string;
              preferred_rep_range?: { min: number; max: number } | null;
            } | null;
            return {
              lastPerformanceRows: lp.data ?? [],
              heaviestFirst: preferences?.prefill_sort_heaviest_first ?? false,
              unitPreference: preferences?.unit_preference ?? 'kg',
              trainingGoals: preferences?.training_goals ?? [],
              experienceLevel: preferences?.experience_level ?? 'intermediate',
              preferredRepRange: preferences?.preferred_rep_range ?? null,
              historySessionsByExercise: new Map(historyEntries),
            };
          })()
        : Promise.resolve({
            lastPerformanceRows: [],
            heaviestFirst: false,
            unitPreference: 'kg' as UnitPreference,
            trainingGoals: [],
            experienceLevel: 'intermediate',
            preferredRepRange: null,
            historySessionsByExercise: new Map(),
          });

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

      const session = await writeBranch;
      router.prefetch(`/workout/${session.id}`);
      const skeletonExercises: StartWorkoutExercise[] = templateExercises.map((templateExercise) => ({
        sessionExercise: sessionExercisesToInsert.find((exercise) => exercise.order_index === templateExercise.order_index)!,
        exercise: parseExercise(templateExercise.exercise as unknown as Record<string, unknown>),
        lastPerformance: null,
        aiSuggestion: null,
        prefilledSets: buildPrefilledSets(templateExercise.default_set_count ?? 3, null),
      }));
      hydrateWorkout({ session, exercises: skeletonExercises });
      router.push(`/workout/${session.id}`);

      const {
        lastPerformanceRows,
        heaviestFirst,
        unitPreference,
        trainingGoals,
        experienceLevel,
        preferredRepRange,
        historySessionsByExercise,
      } = await readBranch;

      const sessionExerciseByOrder = new Map(
        sessionExercisesToInsert.map((exercise) => [exercise.order_index, exercise]),
      );

      const lastPerformanceByExercise = new Map<string, { sets: LastPerformanceSet[] | null }>(
        (lastPerformanceRows ?? []).map((row) => [
          row.exercise_id,
          {
            sets: parseLastPerformance(Array.isArray(row.sets_data) ? row.sets_data : null),
          },
        ]),
      );

      const response: StartWorkoutResponse = {
        session,
        exercises: templateExercises.map((templateExercise): StartWorkoutExercise => {
          const lpEntry = lastPerformanceByExercise.get(templateExercise.exercise_id);
          const rawLast = lpEntry?.sets ?? null;
          // Sort once; reuse the same array for both the "was XX" hint mapping
          // and prefilled-set construction so they stay in lockstep.
          const { sorted: lastPerformance, originalQualifyingOrder } = sortLastPerformanceForPrefill(rawLast, heaviestFirst);
          const exercise = parseExercise(templateExercise.exercise as unknown as Record<string, unknown>);
          const guided = buildGuidedSuggestion({
            schema: exercise.tracking_schema,
            sessions: historySessionsByExercise.get(templateExercise.exercise_id) ?? [],
            unitPreference,
            generatedAt: startedAt,
            muscleGroups: exercise.muscle_groups,
            targetRanges: templateExercise.target_ranges as Record<string, { min?: number; max?: number }> | null,
            trainingGoals,
            experienceLevel,
            preferredRepRange,
            exerciseNotes: exercise.notes,
          });

          const suggestion = guided?.suggestion ?? null;

          // When prefill sorts heaviest-first, reorder per_set_targets to match
          // the sorted lastPerformance order rather than original positional order.
          // Without this, orange guidance pairs with the wrong set row.
          // Immutable spread — never mutates the guided.suggestion object.
          const orderedTargets =
            suggestion?.per_set_targets?.length &&
            heaviestFirst &&
            originalQualifyingOrder.length > 0 &&
            originalQualifyingOrder.length === suggestion.per_set_targets.length
              ? originalQualifyingOrder.map(
                  (origIdx) => suggestion.per_set_targets![origIdx],
                )
              : null;

          const reorderedSuggestion =
            orderedTargets && suggestion
              ? { ...suggestion, per_set_targets: orderedTargets }
              : suggestion;

          return {
            sessionExercise: sessionExerciseByOrder.get(templateExercise.order_index)!,
            exercise,
            lastPerformance,
            aiSuggestion: reorderedSuggestion,
            prefilledSets: buildPrefilledSets(
              templateExercise.default_set_count ?? 3,
              lastPerformance,
            ),
          };
        }),
      };

      applyPrefillAndSuggestions(session.id, response.exercises.map((exercise) => ({
        sessionExerciseId: exercise.sessionExercise.id,
        lastPerformanceSets: exercise.lastPerformance?.map((set) => set.values) ?? null,
        aiSuggestion: exercise.aiSuggestion,
        setTypes: exercise.prefilledSets.map((set) => set.setType),
      })));
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to start workout';
      toast.error(msg);
    }
  }

  return { startWorkout };
}
