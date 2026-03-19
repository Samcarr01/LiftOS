'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import { ExerciseCard } from '@/components/workout/exercise-card';
import { SupersetCard } from '@/components/workout/superset-card';
import { FinishDialog } from '@/components/workout/finish-dialog';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import type { ActiveExerciseState } from '@/types/app';

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
  const [finishOpen, setFinishOpen] = useState(false);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!workout) return;
      event.preventDefault();
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [workout]);

  useEffect(() => {
    if (workout === null) {
      router.replace('/');
    }
  }, [workout, router]);

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

  const templateName = workout.session.template_id ? 'Current Workout' : 'Quick Log';
  const savedSets = workout.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => set.isCompleted).length, 0);
  const totalSets = workout.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);

  return (
    <div className="page-shell">
      <div className="page-content py-4 md:py-6">
        <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.06] bg-white/[0.10] px-4 py-3 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-base font-bold">{templateName}</h1>
              <p className="text-sm text-muted-foreground">{savedSets}/{totalSets} sets</p>
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
    </div>
  );
}
