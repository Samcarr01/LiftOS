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

      const [{
        lastPerformanceRows,
        heaviestFirst,
        unitPreference,
        trainingGoals,
        experienceLevel,
        preferredRepRange,
        historySessionsByExercise,
      }, session] = await Promise.all([readBranch, writeBranch]);

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
          const lastPerformance = sortLastPerformanceForPrefill(rawLast, heaviestFirst);
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

          return {
            sessionExercise: sessionExerciseByOrder.get(templateExercise.order_index)!,
            exercise,
            lastPerformance,
            aiSuggestion: guided?.suggestion ?? null,
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
