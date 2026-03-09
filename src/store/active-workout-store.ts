/**
 * active-workout-store — Zustand store for the in-progress workout session.
 *
 * Hydrated by use-start-workout.ts after the Edge Function returns.
 * All mutations are optimistic: local state updates immediately, DB writes
 * are queued for offline-first sync in Prompt 009.
 */

import { create } from 'zustand';
import { localId } from '@/lib/utils';
import type {
  ActiveWorkoutState,
  ActiveExerciseState,
  SetEntry,
  SetValues,
  StartWorkoutResponse,
} from '@/types';

// ── Store shape ───────────────────────────────────────────────────────────────

interface ActiveWorkoutStore {
  /** Null when no workout is in progress */
  activeWorkout: ActiveWorkoutState | null;
  isLoading: boolean;
  error: string | null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  /** Populate store from Edge Function response */
  hydrateWorkout: (response: StartWorkoutResponse) => void;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
  clearWorkout: () => void;
  setIsCompleting: (value: boolean) => void;

  // ── Set operations ─────────────────────────────────────────────────────────
  /** Add a new set to an exercise, copying values from the last set */
  addSet: (sessionExerciseId: string) => void;
  /** Patch any fields on a specific set */
  updateSet: (sessionExerciseId: string, setIndex: number, patch: Partial<SetEntry>) => void;
  /** Remove a set; re-indexes remaining sets */
  deleteSet: (sessionExerciseId: string, setIndex: number) => void;
  /** Mark a set complete + start rest timer for that exercise */
  completeSet: (sessionExerciseId: string, setIndex: number) => void;

  // ── Timers ─────────────────────────────────────────────────────────────────
  tickElapsedTimer: () => void;
  startRestTimer: (sessionExerciseId: string) => void;
  tickRestTimer: (sessionExerciseId: string) => void;
  stopRestTimer: (sessionExerciseId: string) => void;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function mapExercises(
  exercises: ActiveExerciseState[],
  sessionExerciseId: string,
  updater: (ex: ActiveExerciseState) => ActiveExerciseState,
): ActiveExerciseState[] {
  return exercises.map((ex) =>
    ex.sessionExercise.id === sessionExerciseId ? updater(ex) : ex,
  );
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useActiveWorkoutStore = create<ActiveWorkoutStore>((set, get) => ({
  activeWorkout: null,
  isLoading: false,
  error: null,

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  hydrateWorkout: (response) => {
    const activeWorkout: ActiveWorkoutState = {
      session: response.session,
      exercises: response.exercises.map((ex) => {
        const seId = ex.sessionExercise.id;
        return {
          sessionExercise: ex.sessionExercise,
          exercise: ex.exercise,
          // Convert prefilled sets into local SetEntry objects (isCompleted=false)
          sets: ex.prefilledSets.map((ps) => ({
            id: localId(),
            sessionExerciseId: seId,
            setIndex: ps.setIndex,
            values: ps.values,
            setType: ps.setType,
            isCompleted: false,
            notes: null,
            loggedAt: '',
            isPendingSync: false,
          })),
          // Extract raw values arrays for the "last session" display column
          lastPerformanceSets: ex.lastPerformance
            ? ex.lastPerformance.map((lp) => lp.values)
            : null,
          aiSuggestion: ex.aiSuggestion,
          restTimer: { isRunning: false, remaining: 0 },
        };
      }),
      elapsedTimer: 0,
      isCompleting: false,
    };
    set({ activeWorkout, isLoading: false, error: null });
  },

  setLoading: (value) => set({ isLoading: value }),
  setError: (message) => set({ error: message, isLoading: false }),
  clearWorkout: () => set({ activeWorkout: null, isLoading: false, error: null }),
  setIsCompleting: (value) =>
    set((state) =>
      state.activeWorkout
        ? { activeWorkout: { ...state.activeWorkout, isCompleting: value } }
        : state,
    ),

  // ── Set operations ─────────────────────────────────────────────────────────

  addSet: (sessionExerciseId) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: mapExercises(activeWorkout.exercises, sessionExerciseId, (ex) => {
          const lastSet = ex.sets[ex.sets.length - 1];
          const newSet: SetEntry = {
            id: localId(),
            sessionExerciseId,
            setIndex: (lastSet?.setIndex ?? 0) + 1,
            values: lastSet ? ({ ...lastSet.values } as SetValues) : {},
            setType: 'working',
            isCompleted: false,
            notes: null,
            loggedAt: '',
            isPendingSync: false,
          };
          return { ...ex, sets: [...ex.sets, newSet] };
        }),
      },
    });
  },

  updateSet: (sessionExerciseId, setIndex, patch) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: mapExercises(activeWorkout.exercises, sessionExerciseId, (ex) => ({
          ...ex,
          sets: ex.sets.map((s) =>
            s.setIndex === setIndex ? { ...s, ...patch } : s,
          ),
        })),
      },
    });
  },

  deleteSet: (sessionExerciseId, setIndex) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: mapExercises(activeWorkout.exercises, sessionExerciseId, (ex) => {
          // Remove and re-index so setIndex stays contiguous
          const filtered = ex.sets.filter((s) => s.setIndex !== setIndex);
          const reindexed = filtered.map((s, i) => ({ ...s, setIndex: i + 1 }));
          return { ...ex, sets: reindexed };
        }),
      },
    });
  },

  completeSet: (sessionExerciseId, setIndex) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: mapExercises(activeWorkout.exercises, sessionExerciseId, (ex) => {
          const restSeconds = ex.sessionExercise.rest_seconds ?? ex.exercise.default_rest_seconds;
          return {
            ...ex,
            sets: ex.sets.map((s) =>
              s.setIndex === setIndex
                ? { ...s, isCompleted: true, isPendingSync: true, loggedAt: new Date().toISOString() }
                : s,
            ),
            restTimer: { isRunning: true, remaining: restSeconds },
          };
        }),
      },
    });
  },

  // ── Timers ─────────────────────────────────────────────────────────────────

  tickElapsedTimer: () => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: { ...activeWorkout, elapsedTimer: activeWorkout.elapsedTimer + 1 },
    });
  },

  startRestTimer: (sessionExerciseId) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: mapExercises(activeWorkout.exercises, sessionExerciseId, (ex) => ({
          ...ex,
          restTimer: {
            isRunning: true,
            remaining: ex.sessionExercise.rest_seconds ?? ex.exercise.default_rest_seconds,
          },
        })),
      },
    });
  },

  tickRestTimer: (sessionExerciseId) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: mapExercises(activeWorkout.exercises, sessionExerciseId, (ex) => {
          const remaining = Math.max(0, ex.restTimer.remaining - 1);
          return {
            ...ex,
            restTimer: { isRunning: remaining > 0, remaining },
          };
        }),
      },
    });
  },

  stopRestTimer: (sessionExerciseId) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: mapExercises(activeWorkout.exercises, sessionExerciseId, (ex) => ({
          ...ex,
          restTimer: { isRunning: false, remaining: 0 },
        })),
      },
    });
  },
}));
