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
      <div className="flex min-h-screen items-center justify-center">
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
        <header className="sticky top-0 z-30 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,34,0.94),rgba(10,18,34,0.88))] px-4 py-4 backdrop-blur-xl shadow-[0_30px_80px_-50px_rgba(2,10,28,1)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <button
                onClick={() => {
                  if (confirm('Leave workout? Progress will be lost.')) {
                    useActiveWorkoutStore.getState().clearWorkout();
                    router.back();
                  }
                }}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="min-w-0">
                <span className="hero-kicker">Live Session</span>
                <h1 className="mt-3 font-display text-3xl font-semibold">{templateName}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Fill in each row, then press <span className="font-medium text-foreground">Save Set</span> when that set is done. When the session is over, save the workout once from the button on the right.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap gap-2">
                <span className="status-pill">{savedSets}/{totalSets} sets saved</span>
                <span className="status-pill">{workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={() => setFinishOpen(true)}
                disabled={workout.isCompleting || workout.exercises.length === 0}
                className="premium-button disabled:opacity-60"
              >
                {workout.isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Save Workout
              </button>
            </div>
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
