'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
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
    <div className="premium-card px-4 py-4 text-center">
      <p className="font-display text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
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
      <DialogContent className="sm:max-w-lg border-white/10 bg-[linear-gradient(180deg,rgba(10,18,34,0.98),rgba(10,18,34,0.94))] text-foreground shadow-[0_50px_110px_-60px_rgba(2,10,28,1)]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/14 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="hero-kicker">Finish Workout</p>
              <DialogTitle className="font-display pt-2 text-3xl">Save this session</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Review what you logged, then save the workout. Any open sets stay attached to the session, so you do not lose the structure you built.
        </p>

        <div className="grid gap-3 py-2 md:grid-cols-3">
          <SummaryStat label="Exercises" value={String(workout.exercises.length)} />
          <SummaryStat label="Sets Saved" value={`${doneSets}/${totalSets}`} detail={`${remainingSets} left open`} />
          <SummaryStat label="Session Status" value={remainingSets === 0 ? 'Ready' : 'Partial'} />
        </div>

        {doneSets < totalSets && (
          <div className="glass-panel px-4 py-4 text-sm text-muted-foreground">
            {remainingSets} set{remainingSets !== 1 ? 's are' : ' is'} still open. They will be kept with the workout if you save now.
          </div>
        )}

        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-col">
          <button
            onClick={onClose}
            disabled={saving}
            className="premium-button-secondary w-full justify-center disabled:opacity-60"
          >
            Keep Logging
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="premium-button w-full justify-center disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Workout
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
