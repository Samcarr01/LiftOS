'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { ExerciseCard } from '@/components/workout/exercise-card';
import { FinishDialog } from '@/components/workout/finish-dialog';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const workout = useActiveWorkoutStore((s) => s.workout);
  const dismissedSuggestions = useActiveWorkoutStore((s) => s.dismissedSuggestions);

  const [finishOpen, setFinishOpen] = useState(false);

  // Warn on accidental navigation away
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!workout) return;
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [workout]);

  // If no workout in store (e.g. hard refresh), redirect home
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

  // Verify we're on the right session
  if (workout.session.id !== params.id) {
    router.replace('/');
    return null;
  }

  const templateName = workout.session.template_id
    ? 'Current Workout'
    : 'Quick Log';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => {
            if (confirm('Leave workout? Progress will be lost.')) {
              useActiveWorkoutStore.getState().clearWorkout();
              router.back();
            }
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex flex-1 flex-col">
          <h1 className="truncate text-base font-bold leading-tight">{templateName}</h1>
          <p className="text-xs text-muted-foreground">
            Fill in each set, tap Save on the right, then save the workout when you are done.
          </p>
        </div>

        <button
          onClick={() => setFinishOpen(true)}
          disabled={workout.isCompleting || workout.exercises.length === 0}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {workout.isCompleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save Workout
        </button>
      </header>

      {/* Exercise cards */}
      <main className="flex-1 space-y-4 px-4 py-5 pb-32">
        {workout.exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.sessionExercise.id}
            state={ex}
            exerciseIndex={i}
            isSuggestionDismissed={dismissedSuggestions.includes(i)}
          />
        ))}

        {workout.exercises.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="font-medium">This workout has no exercises</p>
            <p className="text-sm text-muted-foreground">Go back and add exercises before you start logging.</p>
            <button
              onClick={() => {
                useActiveWorkoutStore.getState().clearWorkout();
                router.replace('/templates');
              }}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Go To Workouts
            </button>
          </div>
        )}
      </main>

      {/* Finish dialog */}
      <FinishDialog open={finishOpen} onClose={() => setFinishOpen(false)} />
    </div>
  );
}
