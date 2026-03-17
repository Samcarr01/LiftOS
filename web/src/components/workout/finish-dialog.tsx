'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { invokeAuthedFunction } from '@/lib/supabase/invoke-authed-function';
import { addToQueue } from '@/lib/offline';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useCompletionStore } from '@/store/completion-store';
import type { ActiveWorkoutState } from '@/types/app';
import type { Json } from '@/types/database';

interface FinishDialogProps {
  open:    boolean;
  onClose: () => void;
}

function computeSummary(workout: ActiveWorkoutState) {
  const totalSets  = workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  const doneSets   = workout.exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.isCompleted).length, 0);
  const remainingSets = totalSets - doneSets;
  const elapsed    = Math.floor((Date.now() - new Date(workout.session.started_at).getTime()) / 1000);
  return { totalSets, doneSets, remainingSets, elapsed };
}

export function FinishDialog({ open, onClose }: FinishDialogProps) {
  const workout         = useActiveWorkoutStore((s) => s.workout);
  const setIsCompleting = useActiveWorkoutStore((s) => s.setIsCompleting);
  const clearWorkout    = useActiveWorkoutStore((s) => s.clearWorkout);
  const setResult       = useCompletionStore((s) => s.setResult);
  const router          = useRouter();
  const [saving, setSaving] = useState(false);

  if (!workout) return null;

  const { totalSets, doneSets, remainingSets, elapsed } = computeSummary(workout);

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
    const supabase = createClient();

    try {
      // 1. Save all sets to set_entries (upsert on composite key)
      const setsToSave = workout.exercises.flatMap((ex) =>
        ex.sets.map((set) => ({
          session_exercise_id: set.sessionExerciseId,
          set_index:           set.setIndex,
          values:              set.values as unknown as Json,
          set_type:            set.setType,
          is_completed:        set.isCompleted,
          notes:               set.notes,
        }))
      );

      if (setsToSave.length > 0) {
        const { error: saveErr } = await supabase
          .from('set_entries')
          .upsert(setsToSave, { onConflict: 'session_exercise_id,set_index' }) as { error: unknown };
        if (saveErr) throw saveErr;
      }

      // 2. Call complete-workout Edge Function
      const { data, error: compErr } = await invokeAuthedFunction(
        supabase,
        'complete-workout',
        { session_id: workout.session.id },
      );

      if (compErr) throw compErr;

      // 3. Store completion result then navigate
      type RawPR = { exercise_id: string; exercise_name: string; record_type: string; record_value: number };
      type CompleteWorkoutPayload = {
        new_prs?: RawPR[];
        summary?: { exercise_count: number; total_sets: number; total_volume_kg: number; duration_seconds: number };
      };
      const rawData =
        ((data as { data?: CompleteWorkoutPayload } | null)?.data) ??
        (data as CompleteWorkoutPayload | null);
      const newPrs    = rawData?.new_prs ?? [];
      const summary   = rawData?.summary ?? {
        exercise_count:   workout.exercises.length,
        total_sets:       workout.exercises.reduce((a, e) => a + e.sets.length, 0),
        total_volume_kg:  0,
        duration_seconds: elapsed,
      };

      setResult({
        sessionId:     workout.session.id,
        summary,
        newPrs:        newPrs.map((p) => ({
          exercise_id:   p.exercise_id,
          exercise_name: p.exercise_name,
          record_type:   p.record_type as 'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume',
          record_value:  p.record_value,
        })),
        exerciseNames: workout.exercises.map((e) => e.exercise.name),
      });

      if (newPrs.length > 0) {
        toast.success(`Workout complete! 🏆 ${newPrs.length} new PR${newPrs.length !== 1 ? 's' : ''}!`);
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

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Finish
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
