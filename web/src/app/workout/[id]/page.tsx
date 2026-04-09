'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Plus, Sparkles, Timer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ExerciseCard } from '@/components/workout/exercise-card';
import { SupersetCard } from '@/components/workout/superset-card';
import { FinishDialog } from '@/components/workout/finish-dialog';
import { ExerciseSelector, type ExerciseSelectionOptions } from '@/components/exercise-selector';
import { useActiveWorkoutStore, useWorkoutHydrated } from '@/store/active-workout-store';
import type { ActiveExerciseState, ExerciseWithSchema } from '@/types/app';
import type { SessionExerciseRow } from '@/types/database';

type ExerciseGroup = {
  type: 'single' | 'superset';
  key: string;
  exercises: { state: ActiveExerciseState; exerciseIndex: number }[];
};

function groupExercises(exercises: ActiveExerciseState[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  let current: ExerciseGroup | null = null;

  exercises.forEach((exercise, index) => {
    const groupId = exercise.sessionExercise.superset_group_id;

    if (groupId && current?.type === 'superset' && current.key === groupId) {
      current.exercises.push({ state: exercise, exerciseIndex: index });
    } else {
      if (current) groups.push(current);
      current = {
        type: groupId ? 'superset' : 'single',
        key: groupId ?? exercise.sessionExercise.id,
        exercises: [{ state: exercise, exerciseIndex: index }],
      };
    }
  });

  if (current) groups.push(current);

  return groups.map((g) =>
    g.type === 'superset' && g.exercises.length === 1
      ? { ...g, type: 'single' as const }
      : g,
  );
}

export default function WorkoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workout = useActiveWorkoutStore((state) => state.workout);
  const dismissedSuggestions = useActiveWorkoutStore((state) => state.dismissedSuggestions);
  const clearWorkout = useActiveWorkoutStore((state) => state.clearWorkout);
  const addExerciseToStore = useActiveWorkoutStore((state) => state.addExercise);
  const hydrated = useWorkoutHydrated();
  const [finishOpen, setFinishOpen] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Live elapsed timer
  const [elapsed, setElapsed] = useState('0:00');
  useEffect(() => {
    if (!workout) return;
    const startedAt = new Date(workout.session.started_at).getTime();
    function tick() {
      const diff = Math.floor((Date.now() - startedAt) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [workout]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!workout) return;
      event.preventDefault();
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [workout]);

  useEffect(() => {
    // Only redirect after persist has rehydrated from localStorage
    if (hydrated && workout === null) {
      router.replace('/');
    }
  }, [workout, router, hydrated]);

  if (!workout) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (workout.session.id !== params.id) {
    router.replace('/');
    return null;
  }

  const templateName = workout.session.template_name ?? (workout.session.template_id ? 'Current Workout' : 'Quick Log');
  const savedSets = workout.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => set.isCompleted).length, 0);
  const totalSets = workout.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);

  return (
    <div className="page-shell">
      <div className="page-content py-4 md:py-6">
        <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.06] bg-white/[0.10] px-4 py-3 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLeaveDialog(true)}
              aria-label="Leave workout"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-base font-bold">{templateName}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{savedSets}/{totalSets} sets</span>
                <span className="text-foreground/30">·</span>
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  {elapsed}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${totalSets > 0 ? (savedSets / totalSets) * 100 : 0}%`,
                background: 'linear-gradient(90deg, oklch(0.75 0.18 55), oklch(0.72 0.19 155))',
                boxShadow: savedSets > 0 ? '0 0 8px oklch(0.75 0.18 55 / 0.4)' : 'none',
              }}
            />
          </div>
        </header>

        <main className="mt-5 space-y-5 pb-28">
          {groupExercises(workout.exercises).map((group) => {
            if (group.type === 'single') {
              const { state, exerciseIndex } = group.exercises[0];
              return (
                <ExerciseCard
                  key={state.sessionExercise.id}
                  state={state}
                  exerciseIndex={exerciseIndex}
                  isSuggestionDismissed={dismissedSuggestions.includes(exerciseIndex)}
                />
              );
            }

            return (
              <SupersetCard
                key={group.key}
                exercises={group.exercises}
                dismissedSuggestions={dismissedSuggestions}
              />
            );
          })}

          {/* Add Exercise */}
          <ExerciseSelector
            onSelect={async (exercise: ExerciseWithSchema, options: ExerciseSelectionOptions) => {
              try {
                const supabase = createClient();
                const { data, error } = await supabase
                  .from('session_exercises')
                  .insert({
                    session_id: workout.session.id,
                    exercise_id: exercise.id,
                    order_index: workout.exercises.length,
                  })
                  .select()
                  .single() as { data: SessionExerciseRow | null; error: unknown };
                if (error || !data) throw error ?? new Error('Failed to add exercise');
                addExerciseToStore(data, exercise, options.defaultSetCount);
              } catch {
                toast.error('Failed to add exercise');
              }
            }}
            trigger={
              <button className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <Plus className="h-4 w-4" />
                Add Exercise
              </button>
            }
          />

          {workout.exercises.length === 0 ? (
            <div className="premium-card flex flex-col items-center gap-3 px-5 py-14 text-center">
              <h2 className="font-display text-2xl font-semibold">This workout has no exercises</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Go back to the workout builder, add at least one exercise, then start the session again.
              </p>
              <button
                onClick={() => {
                  useActiveWorkoutStore.getState().clearWorkout();
                  router.replace('/templates');
                }}
                className="premium-button mt-2"
              >
                Go To Workouts
              </button>
            </div>
          ) : (
            <button
              onClick={() => setFinishOpen(true)}
              disabled={workout.isCompleting}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold text-primary-foreground shadow-[0_8px_32px_-8px_oklch(0.75_0.18_55/0.4)] transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
              style={{ background: 'linear-gradient(135deg, oklch(0.75 0.18 55), oklch(0.62 0.17 40))' }}
            >
              {workout.isCompleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              Finish Workout
            </button>
          )}
        </main>
      </div>

      <FinishDialog open={finishOpen} onClose={() => setFinishOpen(false)} />

      {/* Leave confirmation dialog */}
      {showLeaveDialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-[oklch(0.16_0.015_260)] p-5 space-y-4">
            <h3 id="leave-dialog-title" className="font-display text-lg font-bold">Leave workout?</h3>
            <p className="text-sm text-muted-foreground">
              You can save your progress and come back later, or discard the workout entirely.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  // Keep store + DB session intact — resume from home page
                  setShowLeaveDialog(false);
                  router.replace('/');
                }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary-foreground transition-all duration-150 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, oklch(0.75 0.18 55), oklch(0.62 0.17 40))' }}
              >
                Save & Exit
              </button>
              <button
                onClick={async () => {
                  const supabase = createClient();
                  await supabase.from('workout_sessions').delete().eq('id', workout.session.id);
                  clearWorkout();
                  router.replace('/');
                }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/90 text-sm font-semibold text-white transition-all duration-150 hover:bg-red-500 active:scale-[0.98]"
              >
                Discard
              </button>
              <button
                onClick={() => setShowLeaveDialog(false)}
                className="premium-button-secondary w-full justify-center"
              >
                Keep Training
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
