/**
 * useCompleteWorkout — calls the complete-workout Edge Function (or queues
 * offline) and stores the result in the completion store.
 *
 * Flow:
 *  1. Call complete-workout Edge Function
 *  2. On success → store result → clearWorkout → navigate to /workout-complete
 *  3. On offline → compute local summary → queue completion mutation →
 *     store result with isOffline=true → clearWorkout → navigate
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useCompletionStore, type PRRecord } from '@/store/completion-store';
import { addToQueue, triggerSync, getIsOnline } from '@/lib/offline';
import { Analytics } from '@/lib/analytics';
import type { WorkoutSessionRow } from '@/types/database';

// ── Raw Edge Function response ─────────────────────────────────────────────────

interface EdgePR {
  exercise_id: string;
  exercise_name: string;
  record_type: 'best_weight' | 'best_reps_at_weight' | 'best_e1rm';
  record_value: number;
  previous_value: number | null;
}

interface EdgeResponse {
  data: {
    session: WorkoutSessionRow;
    new_prs: EdgePR[];
    summary: {
      exercise_count: number;
      total_sets: number;
      total_volume_kg: number;
      duration_seconds: number;
    };
  };
}

// ── Client-side helpers ────────────────────────────────────────────────────────

function computeLocalSummary(
  activeWorkout: NonNullable<ReturnType<typeof useActiveWorkoutStore.getState>['activeWorkout']>,
  durationSeconds: number,
): { exerciseCount: number; totalSets: number; totalVolumeKg: number } {
  let totalSets = 0;
  let totalVolumeKg = 0;

  for (const ex of activeWorkout.exercises) {
    const completed = ex.sets.filter((s) => s.isCompleted);
    totalSets += completed.length;
    for (const s of completed) {
      const w = s.values['weight'];
      const r = s.values['reps'];
      if (typeof w === 'number' && typeof r === 'number') {
        totalVolumeKg += w * r;
      }
    }
  }

  return {
    exerciseCount: activeWorkout.exercises.length,
    totalSets,
    totalVolumeKg: +totalVolumeKg.toFixed(1),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCompleteWorkout() {
  const router = useRouter();
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeWorkout = useActiveWorkoutStore((s) => s.activeWorkout);
  const clearWorkout = useActiveWorkoutStore((s) => s.clearWorkout);
  const setResult = useCompletionStore((s) => s.setResult);

  const completeWorkout = useCallback(
    async (durationSeconds: number) => {
      if (!activeWorkout || isCompleting) return;
      setIsCompleting(true);
      setError(null);

      const sessionId = activeWorkout.session.id;

      // ── Online path ────────────────────────────────────────────────────────
      if (getIsOnline()) {
        try {
          const { data: raw, error: fnErr } = await supabase.functions.invoke<EdgeResponse>(
            'complete-workout',
            { body: { session_id: sessionId } },
          );

          if (fnErr) throw new Error(fnErr.message);
          if (!raw?.data) throw new Error('Empty response from complete-workout');

          const prs = raw.data.new_prs.map((pr): PRRecord => ({
            exerciseId:    pr.exercise_id,
            exerciseName:  pr.exercise_name,
            recordType:    pr.record_type,
            recordValue:   pr.record_value,
            previousValue: pr.previous_value,
          }));

          setResult({
            session: raw.data.session,
            newPRs:  prs,
            summary: {
              exerciseCount:   raw.data.summary.exercise_count,
              totalSets:       raw.data.summary.total_sets,
              totalVolumeKg:   raw.data.summary.total_volume_kg,
              durationSeconds: raw.data.summary.duration_seconds,
            },
          });

          Analytics.workoutCompleted({
            duration_seconds: raw.data.summary.duration_seconds,
            total_sets:       raw.data.summary.total_sets,
            total_volume_kg:  raw.data.summary.total_volume_kg,
            exercise_count:   raw.data.summary.exercise_count,
            is_offline:       false,
          });
          for (const pr of prs) {
            Analytics.prAchieved({
              exercise_name: pr.exerciseName,
              record_type:   pr.recordType,
              record_value:  pr.recordValue,
            });
          }

          clearWorkout();
          router.replace('/workout-complete');
          return;
        } catch (err: unknown) {
          const msg = (err as { message?: string }).message ?? 'Completion failed';
          // Fall through to offline path on network error
          console.warn('[complete-workout] online path failed, falling back:', msg);
        }
      }

      // ── Offline path ───────────────────────────────────────────────────────
      // Queue the completion mutation; navigate with local stats.
      const now = new Date().toISOString();
      await addToQueue({
        id: `complete_${sessionId}`,
        table: 'workout_sessions',
        operation: 'update',
        data: {
          id: sessionId,
          completed_at: now,
          duration_seconds: durationSeconds,
        },
        timestamp: now,
      });
      triggerSync();

      const localSummary = computeLocalSummary(activeWorkout, durationSeconds);

      setResult({
        session: {
          ...activeWorkout.session,
          completed_at:     now,
          duration_seconds: durationSeconds,
        },
        newPRs:  [],
        summary: {
          ...localSummary,
          durationSeconds,
          isOffline: true,
        },
      });

      Analytics.workoutCompleted({
        duration_seconds: durationSeconds,
        total_sets:       localSummary.totalSets,
        total_volume_kg:  localSummary.totalVolumeKg,
        exercise_count:   localSummary.exerciseCount,
        is_offline:       true,
      });

      clearWorkout();
      router.replace('/workout-complete');
    },
    [activeWorkout, isCompleting, clearWorkout, setResult, router],
  );

  return { completeWorkout, isCompleting, error };
}
