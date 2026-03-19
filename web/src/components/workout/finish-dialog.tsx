'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { addToQueue } from '@/lib/offline';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useCompletionStore } from '@/store/completion-store';
import type { ActiveWorkoutState, CompleteWorkoutResponse } from '@/types/app';

interface FinishDialogProps {
  open: boolean;
  onClose: () => void;
}

function computeSummary(workout: ActiveWorkoutState) {
  const totalSets = workout.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
  const doneSets = workout.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => set.isCompleted).length, 0);
  const remainingSets = totalSets - doneSets;
  return { totalSets, doneSets, remainingSets };
}

export function FinishDialog({ open, onClose }: FinishDialogProps) {
  const workout = useActiveWorkoutStore((state) => state.workout);
  const setIsCompleting = useActiveWorkoutStore((state) => state.setIsCompleting);
  const clearWorkout = useActiveWorkoutStore((state) => state.clearWorkout);
  const setResult = useCompletionStore((state) => state.setResult);
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  if (!workout) return null;

  const { totalSets, doneSets, remainingSets } = computeSummary(workout);

  async function handleConfirm() {
    if (!workout) return;

    if (!navigator.onLine) {
      for (const exercise of workout.exercises) {
        for (const set of exercise.sets) {
          void addToQueue({
            table: 'set_entries',
            operation: 'insert',
            data: {
              session_exercise_id: set.sessionExerciseId,
              set_index: set.setIndex,
              values: set.values,
              set_type: set.setType,
              is_completed: set.isCompleted,
              notes: set.notes,
            },
            timestamp: set.loggedAt || new Date().toISOString(),
          });
        }
      }
      toast.info("You're offline. Sets were saved locally. Finish again once you're back online.");
      onClose();
      return;
    }

    setSaving(true);
    setIsCompleting(true);

    try {
      const response = await fetch('/api/workouts/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: workout.session.id,
          exercises: workout.exercises.map((exercise) => ({
            sessionExerciseId: exercise.sessionExercise.id,
            sets: exercise.sets.map((set) => ({
              setIndex: set.setIndex,
              values: set.values,
              setType: set.setType,
              isCompleted: set.isCompleted,
              notes: set.notes,
              loggedAt: set.loggedAt || null,
            })),
          })),
        }),
      });

      const body = await response.json().catch(() => null) as CompleteWorkoutResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(body && 'error' in body ? body.error ?? 'Failed to save workout' : 'Failed to save workout');
      }

      const result = body as CompleteWorkoutResponse;
      setResult({
        sessionId: result.sessionId,
        summary: result.summary,
        newPrs: result.newPrs,
        exerciseNames: result.exerciseNames,
      });

      if (result.newPrs.length > 0) {
        toast.success(`Workout complete! ${result.newPrs.length} new PR${result.newPrs.length !== 1 ? 's' : ''}.`);
      } else {
        toast.success('Workout complete.');
      }

      clearWorkout();
      router.replace('/workout/complete');
    } catch (err: unknown) {
      const message = (err as { message?: string }).message ?? 'Failed to save workout';
      toast.error(message);
      setIsCompleting(false);
      setSaving(false);
      onClose();
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-t border-white/[0.08] bg-white/[0.10] backdrop-blur-2xl p-0"
      >
        <div className="relative px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          {/* Drag handle */}
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20" />

          {/* Title */}
          <h2 className="font-display text-lg font-bold">Save Workout</h2>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.10] bg-white/[0.06] px-3 py-3 text-center">
              <p className="font-display text-xl font-bold">{workout.exercises.length}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Exercises</p>
            </div>
            <div className="rounded-xl border border-white/[0.10] bg-white/[0.06] px-3 py-3 text-center">
              <p className="font-display text-xl font-bold">{doneSets}/{totalSets}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Sets Done</p>
            </div>
            <div className="rounded-xl border border-white/[0.10] bg-white/[0.06] px-3 py-3 text-center">
              <p className={`font-display text-xl font-bold ${remainingSets === 0 ? 'text-[oklch(0.78_0.17_155)]' : 'text-[oklch(0.82_0.15_60)]'}`}>
                {remainingSets === 0 ? 'Ready' : remainingSets}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {remainingSets === 0 ? 'All complete' : `Open set${remainingSets !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          {/* Warning for open sets */}
          {remainingSets > 0 && (
            <div className="mt-3 rounded-xl border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.08)] px-4 py-3 text-sm text-[oklch(0.82_0.15_60)]">
              {remainingSets} open set{remainingSets !== 1 ? 's' : ''} will be kept with the workout.
            </div>
          )}

          {/* Buttons */}
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="premium-button w-full justify-center disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Workout
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="flex h-12 w-full items-center justify-center rounded-2xl border border-white/10 text-sm font-semibold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-60"
            >
              Keep Logging
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
