'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { addToQueue } from '@/lib/offline';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useCompletionStore } from '@/store/completion-store';
import { useAuthStore } from '@/store/auth-store';
import {
  buildCompletionSummary,
  buildSnapshotRows,
  buildSuggestionRows,
  detectPersonalRecords,
} from '@/lib/workout/client-completion';
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
  return { totalSets, doneSets, remainingSets };
}

export function FinishDialog({ open, onClose }: FinishDialogProps) {
  const workout         = useActiveWorkoutStore((s) => s.workout);
  const setIsCompleting = useActiveWorkoutStore((s) => s.setIsCompleting);
  const clearWorkout    = useActiveWorkoutStore((s) => s.clearWorkout);
  const setResult       = useCompletionStore((s) => s.setResult);
  const user            = useAuthStore((s) => s.user);
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
    const supabase = createClient();

    try {
      if (!user) throw new Error('Please sign in again.');

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

      // 2. Mark session complete directly through RLS instead of the Edge Function.
      const completedAt = new Date().toISOString();
      const summary = buildCompletionSummary(workout);

      const { error: sessionErr } = await supabase
        .from('workout_sessions')
        .update({
          completed_at: completedAt,
          duration_seconds: summary.duration_seconds,
        })
        .eq('id', workout.session.id) as { error: unknown };

      if (sessionErr) throw sessionErr;

      if (workout.session.template_id) {
        const { error: templateErr } = await supabase
          .from('workout_templates')
          .update({ last_used_at: completedAt })
          .eq('id', workout.session.template_id) as { error: unknown };

        if (templateErr) console.warn('[finish-workout] failed to update template last_used_at', templateErr);
      }

      const exerciseIds = workout.exercises.map((exercise) => exercise.exercise.id);
      const existingPrRows = exerciseIds.length > 0
        ? await supabase
            .from('personal_records')
            .select('exercise_id, record_type, record_value')
            .eq('user_id', user.id)
            .in('exercise_id', exerciseIds) as {
            data: Array<{
              exercise_id: string;
              record_type: 'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
              record_value: number;
            }> | null;
            error: unknown;
          }
        : { data: [], error: null };

      if (existingPrRows.error) {
        console.warn('[finish-workout] failed to fetch existing PRs', existingPrRows.error);
      }

      // 3. Best-effort progression data updates for next time.
      const snapshotRows = buildSnapshotRows(workout, user.id, completedAt);
      if (snapshotRows.length > 0) {
        const { error: snapshotErr } = await supabase
          .from('last_performance_snapshots')
          .upsert(snapshotRows, { onConflict: 'user_id,exercise_id' }) as { error: unknown };
        if (snapshotErr) {
          console.warn('[finish-workout] failed to update last performance snapshots', snapshotErr);
        }
      }

      const { newPrs, rows: prRows } = detectPersonalRecords(
        workout,
        existingPrRows.data ?? [],
        user.id,
        completedAt,
      );

      if (prRows.length > 0) {
        const { error: prErr } = await supabase
          .from('personal_records')
          .upsert(prRows, { onConflict: 'user_id,exercise_id,record_type' }) as { error: unknown };
        if (prErr) {
          console.warn('[finish-workout] failed to upsert personal records', prErr);
        }
      }

      const suggestionRows = buildSuggestionRows(workout, user.id, completedAt);
      if (exerciseIds.length > 0) {
        const { error: deleteSuggestionErr } = await supabase
          .from('ai_suggestions')
          .delete()
          .eq('user_id', user.id)
          .in('exercise_id', exerciseIds) as { error: unknown };
        if (deleteSuggestionErr) {
          console.warn('[finish-workout] failed to clear old suggestions', deleteSuggestionErr);
        }
      }

      if (suggestionRows.length > 0) {
        const { error: suggestionErr } = await supabase
          .from('ai_suggestions')
          .insert(suggestionRows) as { error: unknown };
        if (suggestionErr) {
          console.warn('[finish-workout] failed to save fresh suggestions', suggestionErr);
        }
      }

      setResult({
        sessionId:     workout.session.id,
        summary,
        newPrs,
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
