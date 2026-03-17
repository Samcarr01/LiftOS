'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { addToQueue } from '@/lib/offline';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useCompletionStore } from '@/store/completion-store';
import type { ActiveWorkoutState } from '@/types/app';
import type { CompleteWorkoutResponse } from '@/types/app';

interface FinishDialogProps {
  open:    boolean;
  onClose: () => void;
}

function computeSummary(workout: ActiveWorkoutState) {
  const totalSets  = workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  const doneSets   = workout.exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.isCompleted).length, 0);
  const remainingSets = totalSets - doneSets;
  return { totalSets, doneSets, remainingSets };
}

export function FinishDialog({ open, onClose }: FinishDialogProps) {
  const workout         = useActiveWorkoutStore((s) => s.workout);
  const setIsCompleting = useActiveWorkoutStore((s) => s.setIsCompleting);
  const clearWorkout    = useActiveWorkoutStore((s) => s.clearWorkout);
  const setResult       = useCompletionStore((s) => s.setResult);
  const router          = useRouter();
  const [saving, setSaving] = useState(false);

  if (!workout) return null;

  const { totalSets, doneSets, remainingSets } = computeSummary(workout);

  async function handleConfirm() {
    if (!workout) return;

    // ── Offline: queue sets locally, don't navigate yet ──────────────────────
    if (!navigator.onLine) {
      for (const ex of workout.exercises) {
        for (const set of ex.sets) {
          void addToQueue({
            table:     'set_entries',
            operation: 'insert',
            data: {
              session_exercise_id: set.sessionExerciseId,
              set_index:           set.setIndex,
              values:              set.values,
              set_type:            set.setType,
              is_completed:        set.isCompleted,
              notes:               set.notes,
            },
            timestamp: set.loggedAt || new Date().toISOString(),
          });
        }
      }
      toast.info("You're offline — sets saved locally. Tap Finish once reconnected.");
      onClose();
      return;
    }

    // ── Online: direct path ───────────────────────────────────────────────────
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
        toast.success(`Workout complete! 🏆 ${result.newPrs.length} new PR${result.newPrs.length !== 1 ? 's' : ''}!`);
      } else {
        toast.success('Workout complete!');
      }

      clearWorkout();
      router.replace('/workout/complete');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to save workout';
      toast.error(msg);
      setIsCompleting(false);
      setSaving(false);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
        <DialogTitle>Finish Workout?</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 py-4">
          <div className="flex flex-col items-center rounded-xl bg-muted px-3 py-3">
            <span className="text-xl font-bold">{workout.exercises.length}</span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">Exercises</span>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-muted px-3 py-3">
            <span className="text-xl font-bold">{doneSets}<span className="text-sm font-normal text-muted-foreground">/{totalSets}</span></span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">Sets done</span>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-muted px-3 py-3">
            <span className="text-xl font-bold">{remainingSets}</span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">Left open</span>
          </div>
        </div>

        {doneSets < totalSets && (
          <p className="text-center text-sm text-muted-foreground">
            {totalSets - doneSets} set{totalSets - doneSets !== 1 ? 's' : ''} not completed — they'll still be saved.
          </p>
        )}

        <DialogFooter className="mt-4 flex-col gap-2 sm:gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex h-12 w-full items-center justify-center rounded-2xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Keep Logging
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Workout
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
