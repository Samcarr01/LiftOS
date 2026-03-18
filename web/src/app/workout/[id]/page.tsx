'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import { ExerciseCard } from '@/components/workout/exercise-card';
import { FinishDialog } from '@/components/workout/finish-dialog';
import { useActiveWorkoutStore } from '@/store/active-workout-store';

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
        <header className="sticky top-0 z-30 rounded-2xl border border-white/10 bg-[rgba(10,18,34,0.96)] px-4 py-3 backdrop-blur-md shadow-[0_4px_12px_-4px_rgba(2,10,28,0.5)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (confirm('Leave workout? Progress will be lost.')) {
                  useActiveWorkoutStore.getState().clearWorkout();
                  router.back();
                }
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-base font-bold">{templateName}</h1>
              <p className="text-xs text-muted-foreground">{savedSets}/{totalSets} sets</p>
            </div>

            <button
              onClick={() => setFinishOpen(true)}
              disabled={workout.isCompleting || workout.exercises.length === 0}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {workout.isCompleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        </header>

        <main className="mt-6 space-y-5 pb-28">
          {workout.exercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.sessionExercise.id}
              state={exercise}
              exerciseIndex={index}
              isSuggestionDismissed={dismissedSuggestions.includes(index)}
            />
          ))}

          {workout.exercises.length === 0 && (
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
          )}
        </main>
      </div>

      <FinishDialog open={finishOpen} onClose={() => setFinishOpen(false)} />
    </div>
  );
}
