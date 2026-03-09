import { create } from 'zustand';
import type { ActiveWorkout, SetEntry, SetValues } from '@/types';
import { localId } from '@/lib/utils';
import { offlineQueue } from '@/lib/offline-queue';

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;
  isWorkoutActive: boolean;

  startWorkout: (workout: ActiveWorkout) => void;
  logSet: (
    sessionExerciseId: string,
    setIndex: number,
    values: SetValues
  ) => void;
  updateSet: (
    sessionExerciseId: string,
    setIndex: number,
    patch: Partial<SetEntry>
  ) => void;
  completeWorkout: () => void;
  discardWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  activeWorkout: null,
  isWorkoutActive: false,

  startWorkout: (workout) => set({ activeWorkout: workout, isWorkoutActive: true }),

  logSet: (sessionExerciseId, setIndex, values) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const newSet: SetEntry = {
      id: localId(),
      sessionExerciseId,
      setIndex,
      values,
      setType: 'working',
      isCompleted: true,
      notes: null,
      loggedAt: new Date().toISOString(),
      isPendingSync: true,
    };

    // Enqueue for offline sync
    offlineQueue.enqueue({
      type: 'INSERT_SET',
      payload: {
        session_exercise_id: sessionExerciseId,
        set_index: setIndex,
        values,
        set_type: 'working',
        is_completed: true,
      },
    });

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: activeWorkout.exercises.map((ex) => {
          if (ex.id !== sessionExerciseId) return ex;
          const existingIndex = ex.sets.findIndex((s) => s.setIndex === setIndex);
          const sets =
            existingIndex >= 0
              ? ex.sets.map((s) => (s.setIndex === setIndex ? newSet : s))
              : [...ex.sets, newSet];
          return { ...ex, sets };
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
        exercises: activeWorkout.exercises.map((ex) => {
          if (ex.id !== sessionExerciseId) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s) =>
              s.setIndex === setIndex ? { ...s, ...patch } : s
            ),
          };
        }),
      },
    });
  },

  completeWorkout: () => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    offlineQueue.enqueue({
      type: 'COMPLETE_WORKOUT',
      payload: { sessionId: activeWorkout.sessionId },
    });

    set({ activeWorkout: null, isWorkoutActive: false });
  },

  discardWorkout: () => set({ activeWorkout: null, isWorkoutActive: false }),
}));
