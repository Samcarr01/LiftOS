'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TrackingSchemaValidator } from '@/lib/validation';
import type {
  ActiveWorkoutState,
  ActiveExerciseState,
  ExerciseWithSchema,
  SetEntry,
  SetValues,
  StartWorkoutResponse,
} from '@/types/app';
import type { SessionExerciseRow } from '@/types/database';

// ── Global rest timer (one at a time, persists across scroll) ─────────────────

export interface GlobalRestTimer {
  isRunning:  boolean;
  startedAt:  number | null; // Date.now() when started
  duration:   number;        // total seconds
}

// ── Store interface ───────────────────────────────────────────────────────────

interface ActiveWorkoutStore {
  workout:              ActiveWorkoutState | null;
  restTimer:            GlobalRestTimer;
  dismissedSuggestions: number[]; // exerciseIndex values

  // Lifecycle
  hydrateWorkout:  (response: StartWorkoutResponse) => void;
  clearWorkout:    () => void;
  setIsCompleting: (v: boolean) => void;

  // Exercise mutations
  addExercise: (sessionExercise: SessionExerciseRow, exercise: ExerciseWithSchema, setCount: number) => void;

  // Set mutations
  addSet:      (exerciseIndex: number) => void;
  updateSet:   (exerciseIndex: number, setId: string, patch: { values?: SetValues; setType?: SetEntry['setType']; notes?: string | null }) => void;
  deleteSet:   (exerciseIndex: number, setId: string) => void;
  completeSet: (exerciseIndex: number, setId: string) => void;

  // AI suggestion
  acceptSuggestion:  (exerciseIndex: number) => void;
  dismissSuggestion: (exerciseIndex: number) => void;

  // Rest timer
  startRestTimer: (durationSeconds: number) => void;
  stopRestTimer:  () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmptySet(sessionExerciseId: string, setIndex: number): SetEntry {
  return {
    id:                crypto.randomUUID(),
    sessionExerciseId,
    setIndex,
    values:            {},
    setType:           'working',
    isCompleted:       false,
    notes:             null,
    loggedAt:          '',
  };
}

const DEFAULT_REST: GlobalRestTimer = { isRunning: false, startedAt: null, duration: 0 };

// ── Store ─────────────────────────────────────────────────────────────────────

export const useActiveWorkoutStore = create<ActiveWorkoutStore>()(persist((set, get) => ({
  workout:              null,
  restTimer:            DEFAULT_REST,
  dismissedSuggestions: [],

  hydrateWorkout(response) {
    const exercises: ActiveExerciseState[] = response.exercises.map((ex) => {
      // Parse tracking_schema from raw JSON (Edge Function returns jsonb as plain object)
      const parsedSchema = TrackingSchemaValidator.parse(ex.exercise.tracking_schema);
      const exercise = { ...ex.exercise, tracking_schema: parsedSchema };

      const sets: SetEntry[] = ex.prefilledSets.map((ps) => ({
        id:                crypto.randomUUID(),
        sessionExerciseId: ex.sessionExercise.id,
        setIndex:          ps.setIndex,
        values:            {},
        setType:           ps.setType,
        isCompleted:       false,
        notes:             null,
        loggedAt:          '',
      }));

      return {
        sessionExercise:     ex.sessionExercise,
        exercise,
        sets,
        lastPerformanceSets: ex.lastPerformance?.map((lp) => lp.values) ?? null,
        aiSuggestion:        ex.aiSuggestion,
        restTimer:           { isRunning: false, remaining: 0 }, // not used (global timer)
      };
    });

    set({
      workout: {
        session:      response.session,
        exercises,
        elapsedTimer: 0,
        isCompleting: false,
      },
      restTimer:            DEFAULT_REST,
      dismissedSuggestions: [],
    });
  },

  clearWorkout() {
    set({ workout: null, restTimer: DEFAULT_REST, dismissedSuggestions: [] });
  },

  addExercise(sessionExercise, exercise, setCount) {
    set((s) => {
      if (!s.workout) return {};
      const parsedSchema = TrackingSchemaValidator.parse(exercise.tracking_schema);
      const sets: SetEntry[] = Array.from({ length: setCount }, (_, i) => ({
        id: crypto.randomUUID(),
        sessionExerciseId: sessionExercise.id,
        setIndex: i,
        values: {},
        setType: 'working' as const,
        isCompleted: false,
        notes: null,
        loggedAt: '',
      }));
      const newExercise: ActiveExerciseState = {
        sessionExercise,
        exercise: { ...exercise, tracking_schema: parsedSchema },
        sets,
        lastPerformanceSets: null,
        aiSuggestion: null,
        restTimer: { isRunning: false, remaining: 0 },
      };
      return {
        workout: {
          ...s.workout,
          exercises: [...s.workout.exercises, newExercise],
        },
      };
    });
  },

  setIsCompleting(v) {
    set((s) => s.workout ? { workout: { ...s.workout, isCompleting: v } } : {});
  },

  addSet(exerciseIndex) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};

      const lastSet = ex.sets[ex.sets.length - 1];
      const newSet: SetEntry = {
        id:                crypto.randomUUID(),
        sessionExerciseId: ex.sessionExercise.id,
        setIndex:          ex.sets.length,
        values:            {},
        setType:           lastSet?.setType ?? 'working',
        isCompleted:       false,
        notes:             null,
        loggedAt:          '',
      };

      exercises[exerciseIndex] = { ...ex, sets: [...ex.sets, newSet] };
      return { workout: { ...s.workout, exercises } };
    });
  },

  updateSet(exerciseIndex, setId, patch) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};
      const sets = ex.sets.map((st) => st.id === setId ? { ...st, ...patch } : st);
      exercises[exerciseIndex] = { ...ex, sets };
      return { workout: { ...s.workout, exercises } };
    });
  },

  deleteSet(exerciseIndex, setId) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};
      const sets = ex.sets
        .filter((st) => st.id !== setId)
        .map((st, i) => ({ ...st, setIndex: i }));
      exercises[exerciseIndex] = { ...ex, sets };
      return { workout: { ...s.workout, exercises } };
    });
  },

  completeSet(exerciseIndex, setId) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};
      const sets = ex.sets.map((st) =>
        st.id === setId
          ? st.isCompleted
            ? { ...st, isCompleted: false, loggedAt: '' }
            : { ...st, isCompleted: true, loggedAt: new Date().toISOString() }
          : st,
      );
      exercises[exerciseIndex] = { ...ex, sets };
      return { workout: { ...s.workout, exercises } };
    });
  },

  acceptSuggestion(exerciseIndex) {
    set((s) => {
      if (!s.workout) return {};
      const ex = s.workout.exercises[exerciseIndex];
      if (!ex?.aiSuggestion) return {};

      const target = ex.aiSuggestion.next_target?.values;
      if (!target) return {};

      const targetValues: SetValues = {};
      if (target.weight !== undefined) targetValues['weight'] = target.weight;
      if (target.added_weight !== undefined) targetValues['added_weight'] = target.added_weight;
      if (target.reps !== undefined) targetValues['reps'] = target.reps;
      if (target.laps !== undefined) targetValues['laps'] = target.laps;
      if (target.duration !== undefined) targetValues['duration'] = target.duration;
      if (target.distance !== undefined) targetValues['distance'] = target.distance;
      if (target.height !== undefined) targetValues['height'] = target.height;

      // Fill only the first uncompleted set
      let filled = false;
      const exercises = [...s.workout.exercises];
      const sets = ex.sets.map((st) => {
        if (!st.isCompleted && !filled) {
          filled = true;
          return { ...st, values: { ...st.values, ...targetValues } };
        }
        return st;
      });
      exercises[exerciseIndex] = { ...ex, sets };

      return {
        workout:              { ...s.workout, exercises },
        dismissedSuggestions: [...s.dismissedSuggestions, exerciseIndex],
      };
    });
  },

  dismissSuggestion(exerciseIndex) {
    set((s) => ({
      dismissedSuggestions: [...s.dismissedSuggestions, exerciseIndex],
    }));
  },

  startRestTimer(durationSeconds) {
    set({ restTimer: { isRunning: true, startedAt: Date.now(), duration: durationSeconds } });
  },

  stopRestTimer() {
    set({ restTimer: DEFAULT_REST });
  },
}), {
  name: 'liftos-active-workout',
  partialize: (state) => ({
    workout: state.workout,
    dismissedSuggestions: state.dismissedSuggestions,
    // Don't persist restTimer — it uses Date.now() which would be stale
  }),
}));

// Hydration helper — wait for persist to restore before acting on null state
export const useWorkoutHydrated = () =>
  useActiveWorkoutStore.persist.hasHydrated();

// Stable selector helpers
export const selectWorkout    = (s: ReturnType<typeof useActiveWorkoutStore.getState>) => s.workout;
export const selectRestTimer  = (s: ReturnType<typeof useActiveWorkoutStore.getState>) => s.restTimer;
