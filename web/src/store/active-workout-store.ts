'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { TrackingSchemaValidator } from '@/lib/validation';
import { deleteSetEntry } from '@/lib/offline';
import { normalizeReadiness, normalizeRir } from '@/lib/workout/complete-workout-persistence';
import type {
  ActiveWorkoutState,
  ActiveExerciseState,
  ExerciseWithSchema,
  SetEntry,
  SetValues,
  StartWorkoutResponse,
} from '@/types/app';
import type { SessionExerciseRow } from '@/types/database';
import type { Readiness } from '@/types/training-context';

// ── Global rest timer (one at a time, persists across scroll) ─────────────────

export interface GlobalRestTimer {
  isRunning:  boolean;
  startedAt:  number | null; // Date.now() when started
  duration:   number;        // total seconds
}

// ── Store interface ───────────────────────────────────────────────────────────

/**
 * One exercise's share of the read branch of Start Workout.
 *
 * `hydrateWorkout` now runs on the write branch alone, so the lifter reaches
 * their exercise list without waiting on last-session snapshots or guided
 * targets. These arrive a beat later and fill the display-only columns in.
 */
export interface PrefillAndSuggestionUpdate {
  sessionExerciseId:   string;
  lastPerformanceSets: SetValues[] | null;
  aiSuggestion:        ActiveExerciseState['aiSuggestion'];
  /**
   * Positional set types from the prefill build — the previous session's shape
   * (a leading warmup, say), which is only knowable once the snapshot lands.
   */
  setTypes:            SetEntry['setType'][];
}

interface ActiveWorkoutStore {
  workout:              ActiveWorkoutState | null;
  restTimer:            GlobalRestTimer;
  dismissedSuggestions: number[]; // exerciseIndex values

  // Lifecycle
  hydrateWorkout:            (response: StartWorkoutResponse) => void;
  applyPrefillAndSuggestions: (sessionId: string, updates: PrefillAndSuggestionUpdate[]) => void;
  clearWorkout:      () => void;
  setIsCompleting:   (v: boolean) => void;
  setIsLightSession: (v: boolean) => void;

  // Exercise mutations
  addExercise: (sessionExercise: SessionExerciseRow, exercise: ExerciseWithSchema, setCount: number) => void;

  // Workout context (optional; never gates logging)
  setReadiness:           (value: Readiness | null) => void;
  dismissReadinessPrompt: () => void;

  // Set mutations
  addSet:      (exerciseIndex: number) => void;
  updateSet:   (exerciseIndex: number, setId: string, patch: { values?: SetValues; setType?: SetEntry['setType']; notes?: string | null }) => void;
  deleteSet:   (exerciseIndex: number, setId: string) => void;
  completeSet: (exerciseIndex: number, setId: string) => void;
  setSetRir:   (exerciseIndex: number, setId: string, rir: number | null) => void;

  // AI suggestion
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
    rir:               null,
    notes:             null,
    loggedAt:          '',
  };
}

const DEFAULT_REST: GlobalRestTimer = { isRunning: false, startedAt: null, duration: 0 };

// ── Persisted set keys ────────────────────────────────────────────────────────
// `setIndex` is not this set's position in the list. It is half of
// (session_exercise_id, set_index) — the pair `logSetEntry` queues under and the
// server upserts on — so it is a key that may already be in flight the instant a
// set is completed. Renumbering it would point one set's queued write at another
// set's row; re-issuing it would point a new set at a deleted row.
//
// The high-watermark of issued keys therefore lives in the persisted workout
// (`issuedSetIndexHighWatermarks`), not in module memory: closing the PWA loses
// module memory while the Dexie queue survives it, and a watermark that reset on
// reload would re-issue keys the surviving queue still refers to.

type SetIndexWatermarks = Record<string, number>;

/** The highest key a set list currently holds, or -1 when it holds none. */
function highestSetIndex(sets: SetEntry[]): number {
  return sets.reduce((max, st) => Math.max(max, st.setIndex), -1);
}

/**
 * Fold exercises into a watermark record without ever lowering one.
 *
 * Used to seed a fresh workout and to admit a newly added exercise. Deletion
 * never calls this: a deleted set's key stays retired for the life of the
 * workout, which is the whole point of recording it.
 */
function seedWatermarks(
  exercises: ActiveExerciseState[],
  base: SetIndexWatermarks = {},
): SetIndexWatermarks {
  const next: SetIndexWatermarks = { ...base };
  for (const ex of exercises) {
    const id = ex.sessionExercise.id;
    next[id] = Math.max(next[id] ?? -1, highestSetIndex(ex.sets));
  }
  return next;
}

/**
 * The highest key issued for one exercise so far.
 *
 * A workout persisted before this field existed rehydrates without it, so the
 * keys its sets still hold are the floor — the best evidence available, and
 * never lower than what the old `sets.length` allocation would have produced.
 */
function issuedWatermark(
  watermarks: SetIndexWatermarks | undefined,
  sessionExerciseId: string,
  sets: SetEntry[],
): number {
  const recorded = watermarks?.[sessionExerciseId];
  const derived = highestSetIndex(sets);
  return typeof recorded === 'number' && Number.isFinite(recorded)
    ? Math.max(recorded, derived)
    : derived;
}

/**
 * `localStorage`, looked up per call rather than once at module load, and
 * written in idle time rather than inside the mutation.
 *
 * Zustand's default storage reads `window.localStorage` while the store is
 * being created, so anywhere `window` is absent at that instant — a server
 * render, a plain-node test that installs its storage on `globalThis` — the
 * middleware silently detaches itself and `useActiveWorkoutStore.persist`
 * never exists. Resolving late keeps the browser behaviour byte-identical and
 * leaves the persist API observable everywhere else.
 *
 * Persist wraps `set`, so the serialise-and-write happens *before* React is
 * told anything changed: every tap of the tick used to stringify the whole
 * workout (25–60 KB for an eight-exercise session) and block on a
 * `localStorage` write, twice — once for the set, once for the rest timer.
 * Deferring is safe because durability does not live here: `logSetEntry`
 * queues every completed set into Dexie, and this copy is only crash-resume
 * state. The last write wins per key, so coalescing loses nothing but work.
 */

/** Newest value per key, waiting for the flush that will write it. */
let pendingWrites: Record<string, string> = {};
let flushHandle: number | null = null;

function cancelScheduledFlush() {
  if (flushHandle === null) return;
  if (typeof globalThis.cancelIdleCallback === 'function') globalThis.cancelIdleCallback(flushHandle);
  else clearTimeout(flushHandle);
  flushHandle = null;
}

/** Write everything outstanding. Safe to call when nothing is outstanding. */
function flushPendingWrites() {
  flushHandle = null;
  const writes = pendingWrites;
  pendingWrites = {};
  for (const [name, value] of Object.entries(writes)) {
    globalThis.localStorage?.setItem(name, value);
  }
}

/**
 * Idle, or 400 ms from now — whichever comes first. `requestIdleCallback`'s
 * own `timeout` gives the deadline where it exists; `setTimeout` is the
 * deadline where it doesn't (Safari).
 */
function scheduleFlush() {
  if (flushHandle !== null) return;
  flushHandle = typeof globalThis.requestIdleCallback === 'function'
    ? globalThis.requestIdleCallback(flushPendingWrites, { timeout: 400 })
    : (setTimeout(flushPendingWrites, 400) as unknown as number);
}

const LAZY_LOCAL_STORAGE: StateStorage = {
  // Pending beats stored: a read between a write and its flush must not see
  // the value the flush is about to replace.
  getItem:    (name) => pendingWrites[name] ?? globalThis.localStorage?.getItem(name) ?? null,
  setItem:    (name, value) => { pendingWrites[name] = value; scheduleFlush(); },
  // Removal is immediate and cancels any write still queued for that key —
  // a deferred write must never resurrect a workout the lifter discarded.
  removeItem: (name) => { delete pendingWrites[name]; globalThis.localStorage?.removeItem(name); },
};

// Backgrounding a PWA is the one moment the deferral could cost something, so
// both events that precede it flush synchronously. `pagehide` covers the
// bfcache/terminate path that `visibilitychange` does not fire for on iOS.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    cancelScheduledFlush();
    flushPendingWrites();
  });
  window.addEventListener('pagehide', () => {
    cancelScheduledFlush();
    flushPendingWrites();
  });
}

// ── RIR eligibility ───────────────────────────────────────────────────────────
// One optional rating per exercise, and it belongs to the set the lifter
// actually finished on: the last working/top set, once it is completed. A
// warmup, drop or failure row never carries it, and neither does a qualifying
// row that still has a qualifying row after it.

const RIR_SET_TYPES = new Set<SetEntry['setType']>(['working', 'top']);

/**
 * The only set that may hold RIR right now, or null when there is none.
 *
 * Exported so the card that renders the control and the store that stores the
 * value answer "which set?" from one definition rather than two.
 */
export function eligibleRirSetId(sets: SetEntry[]): string | null {
  for (let i = sets.length - 1; i >= 0; i -= 1) {
    const set = sets[i];
    if (RIR_SET_TYPES.has(set.setType)) {
      // The last qualifying set owns the question. Until it is completed,
      // nothing in the exercise is eligible — an earlier set is not "final".
      return set.isCompleted ? set.id : null;
    }
  }
  return null;
}

/**
 * Drop any RIR that is no longer on the eligible set.
 *
 * Clearing, never re-attributing: a 1 the lifter recorded against their top
 * single must not become the rating of a back-off set they added afterwards.
 */
function clearIneligibleRir(sets: SetEntry[]): SetEntry[] {
  const eligibleId = eligibleRirSetId(sets);
  let changed = false;
  const next = sets.map((set) => {
    if (set.rir !== null && set.rir !== undefined && set.id !== eligibleId) {
      changed = true;
      return { ...set, rir: null };
    }
    return set;
  });
  return changed ? next : sets;
}

/** Replace one exercise's sets, keeping the RIR invariant true afterwards. */
function withSets(exercise: ActiveExerciseState, sets: SetEntry[]): ActiveExerciseState {
  return { ...exercise, sets: clearIneligibleRir(sets) };
}

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
        values:            {},  // Blank inputs; last performance & per-set targets are display-only
        setType:           ps.setType,
        isCompleted:       false,
        notes:             null,
        loggedAt:          '',
        rir:               null,  // Explicitly "not given" — absence is not RIR 0
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
        session:        response.session,
        exercises,
        elapsedTimer:   0,
        isCompleting:   false,
        isLightSession: false,
        // Readiness belongs to this session: a new workout is always unasked,
        // never yesterday's answer.
        readiness:                null,
        readinessPromptDismissed: false,
        // A new session starts a new key space — the previous workout's
        // exercises are gone and their watermarks with them.
        issuedSetIndexHighWatermarks: seedWatermarks(exercises),
      },
      restTimer:            DEFAULT_REST,
      dismissedSuggestions: [],
    });
  },

  /**
   * Fill in the display-only half of a workout that was hydrated early.
   *
   * Late by construction, so it never overwrites the lifter. `lastPerformanceSets`
   * and `aiSuggestion` are read-only columns and simply land; a set type only
   * lands on a row that is still exactly as it was created — untyped, unlogged,
   * uncompleted. A workout the lifter has already left, or a different session
   * entirely, is not touched at all.
   */
  applyPrefillAndSuggestions(sessionId, updates) {
    set((s) => {
      if (!s.workout || s.workout.session.id !== sessionId) return {};

      const bySessionExerciseId = new Map(updates.map((u) => [u.sessionExerciseId, u]));
      let matched = false;

      const exercises = s.workout.exercises.map((ex) => {
        const update = bySessionExerciseId.get(ex.sessionExercise.id);
        if (!update) return ex;
        matched = true;

        const sets = ex.sets.map((st, index) => {
          const setType = update.setTypes[index];
          const untouched = !st.isCompleted && st.loggedAt === '' && Object.keys(st.values).length === 0;
          return setType && untouched && setType !== st.setType ? { ...st, setType } : st;
        });

        return withSets(
          { ...ex, lastPerformanceSets: update.lastPerformanceSets, aiSuggestion: update.aiSuggestion },
          sets,
        );
      });

      return matched ? { workout: { ...s.workout, exercises } } : {};
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
        rir: null,
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
          issuedSetIndexHighWatermarks: seedWatermarks(
            [newExercise],
            s.workout.issuedSetIndexHighWatermarks,
          ),
        },
      };
    });
  },

  setIsCompleting(v) {
    set((s) => s.workout ? { workout: { ...s.workout, isCompleting: v } } : {});
  },

  setIsLightSession(v) {
    set((s) => s.workout ? { workout: { ...s.workout, isLightSession: v } } : {});
  },

  /**
   * Store the answer and nothing else. An unreadable value is dropped rather
   * than mapped onto the nearest level — it would only fail
   * `chk_session_readiness` on arrival, and a guessed readiness is worse than
   * none. Choosing a level leaves the strip on screen so it stays correctable.
   */
  setReadiness(value) {
    set((s) => s.workout ? { workout: { ...s.workout, readiness: normalizeReadiness(value) } } : {});
  },

  /** Collapse the one-time strip. Answering it and dismissing it are separate acts. */
  dismissReadinessPrompt() {
    set((s) => s.workout ? { workout: { ...s.workout, readinessPromptDismissed: true } } : {});
  },

  addSet(exerciseIndex) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};

      const lastSet = ex.sets[ex.sets.length - 1];
      const nextSetIndex = issuedWatermark(
        s.workout.issuedSetIndexHighWatermarks,
        ex.sessionExercise.id,
        ex.sets,
      ) + 1;
      const newSet: SetEntry = {
        id:                crypto.randomUUID(),
        sessionExerciseId: ex.sessionExercise.id,
        // A fresh key, never `ex.sets.length` — after a deletion that number is
        // already owned by a set whose write is queued under it.
        setIndex:          nextSetIndex,
        values:            {},
        setType:           lastSet?.setType ?? 'working',
        isCompleted:       false,
        notes:             null,
        loggedAt:          '',
        rir:               null,
      };

      // Growing the exercise puts "which set was final?" back in question, so
      // any rating already given is cleared rather than left attached to a set
      // the lifter may no longer regard as their last one.
      const sets = [...ex.sets, newSet].map((st) => (st.rir === null ? st : { ...st, rir: null }));

      exercises[exerciseIndex] = { ...ex, sets };
      return {
        workout: {
          ...s.workout,
          exercises,
          issuedSetIndexHighWatermarks: {
            ...s.workout.issuedSetIndexHighWatermarks,
            [ex.sessionExercise.id]: nextSetIndex,
          },
        },
      };
    });
  },

  updateSet(exerciseIndex, setId, patch) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};
      const sets = ex.sets.map((st) => st.id === setId ? { ...st, ...patch } : st);
      // `patch` never carries `rir` — retyping a set out of working/top is the
      // only way this write touches it, and then only to clear it.
      exercises[exerciseIndex] = withSets(ex, sets);
      return { workout: { ...s.workout, exercises } };
    });
  },

  deleteSet(exerciseIndex, setId) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};

      const removed = ex.sets.find((st) => st.id === setId);
      // Every survivor keeps the key it already holds. Renumbering here used to
      // point each later set at the row in front of it: a queued write would
      // land on a neighbour's row, overwriting a set the lifter really did.
      const sets = ex.sets.filter((st) => st.id !== setId);

      // Every deletion is mirrored to the offline queue. For a set that was
      // never logged, cancellation is a no-op and the server delete finds no
      // row, which is safely idempotent. This deliberately avoids inferring
      // history from `isCompleted`: a lifter can complete, reopen, then delete
      // a set, and its earlier queued write must still be withdrawn.
      if (removed) {
        void deleteSetEntry(removed).catch((err) => {
          console.error('[LiftOS offline] deleteSetEntry failed:', err);
        });
      }

      // A deleted set takes its rating with it; the set before it is not
      // retroactively rated.
      exercises[exerciseIndex] = withSets(ex, sets);
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
      // Re-opening a set drops its RIR: the rating describes a set that was
      // performed, and a stray 0 in particular must not survive as "nothing left".
      exercises[exerciseIndex] = withSets(ex, sets);
      return { workout: { ...s.workout, exercises } };
    });
  },

  /**
   * Record, change or clear the optional RIR on the final completed working/top
   * set. Anything else is ignored: a rating given for one set is never quietly
   * attached to another, and an unusable value is `null`, never a rounded guess.
   */
  setSetRir(exerciseIndex, setId, rir) {
    set((s) => {
      if (!s.workout) return {};
      const exercises = [...s.workout.exercises];
      const ex = exercises[exerciseIndex];
      if (!ex) return {};
      if (eligibleRirSetId(ex.sets) !== setId) return {};

      const value = normalizeRir(rir);
      const sets = ex.sets.map((st) => (st.id === setId ? { ...st, rir: value } : st));
      exercises[exerciseIndex] = withSets(ex, sets);
      return { workout: { ...s.workout, exercises } };
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
  storage: createJSONStorage(() => LAZY_LOCAL_STORAGE),
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
