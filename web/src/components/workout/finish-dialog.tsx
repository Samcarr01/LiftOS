'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

function SummaryStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.10] bg-[oklch(0.19_0.014_264)] px-4 py-3 text-center">
      <p className="font-display text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
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
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent className="relative sm:max-w-lg overflow-hidden border-white/[0.07] bg-[oklch(0.24_0.016_264)] text-foreground">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">Save Workout</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Open sets will be kept with the session.
        </p>

        <div className="grid gap-3 py-2 md:grid-cols-3">
          <SummaryStat label="Exercises" value={String(workout.exercises.length)} />
          <SummaryStat label="Sets Saved" value={`${doneSets}/${totalSets}`} detail={`${remainingSets} left open`} />
          <SummaryStat label="Session Status" value={remainingSets === 0 ? 'Ready' : 'Partial'} />
        </div>

        {doneSets < totalSets && (
          <div className="rounded-xl border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.12)] px-4 py-3 text-sm text-[oklch(0.82_0.15_60)]">
            {remainingSets} set{remainingSets !== 1 ? 's are' : ' is'} still open. They will be kept with the workout if you save now.
          </div>
        )}

        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-col">
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
            className="premium-button-secondary w-full justify-center disabled:opacity-60"
          >
            Keep Logging
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
