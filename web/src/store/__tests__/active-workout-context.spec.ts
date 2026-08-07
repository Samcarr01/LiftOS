/**
 * Cycle 3 — RED — Optional workout context in the active-workout store
 *
 * Run with: npx tsx src/store/__tests__/active-workout-context.spec.ts
 *
 * Plan: .hermes/plans/2026-08-07_cycle-3-workout-context-capture.md
 * Task 3 (readiness lives in active-workout state, Skip stores null and blocks
 * nothing), Task 4 (one optional RIR on the final working/top set, never in
 * `values`), Risk 3 (the final-qualifying-set decision has to be pinned).
 *
 * Written BEFORE the store carries either field. Cycle 2 already released the
 * persistence — `workout_sessions.readiness`, `set_entries.rir`,
 * `ReadinessSchema`, `RirSchema`, `buildSetEntryUpsertRows` — so what is missing
 * is only the client state that feeds it. This suite pins that state.
 *
 * Wished-for surface on `useActiveWorkoutStore`:
 *
 *   workout.readiness:                Readiness | null  // null = not asked / skipped
 *   workout.readinessPromptDismissed: boolean           // the strip has collapsed
 *   setReadiness(value: Readiness | null): void         // stores the answer only
 *   dismissReadinessPrompt(): void                      // collapses the strip only
 *   setSetRir(exerciseIndex: number, setId: string, rir: number | null): void
 *   SetEntry.rir:                     number | null     // 3 is the stored "3+"
 *
 * The two readiness members are deliberately separate. Choosing a level leaves
 * the strip on screen so it can be corrected; Skip is `setReadiness(null)`
 * followed by `dismissReadinessPrompt()` — no selection, and the strip goes.
 *
 * Three properties matter more than the rest.
 *
 *   1. Optional means optional. `null` is "never asked", never "bad day" and
 *      never RIR 0. Skip is a real answer to the prompt and no answer to the
 *      question, so it collapses the strip and stores nothing.
 *   2. Context never touches performance. Choosing readiness or RIR must leave
 *      every `set.values`, `isCompleted`, `setIndex`, `setType` and set ordering
 *      exactly as it found them — those three concepts (editable values,
 *      historical Last, orange target) stayed separate through Cycle 1 and stay
 *      separate here. In particular `rir` is a first-class `set_entries` column,
 *      so it must never appear as a key inside `values`.
 *   3. RIR belongs to *one* set: the final completed working/top set of its
 *      exercise. Plan Risk 3 leaves the choice open for a set that stops being
 *      that one. This suite pins the safer half of it: **the value is cleared,
 *      never re-attributed**. A 1 the lifter recorded against their top single
 *      must not silently become the RIR of a back-off set they added afterwards.
 *
 * No Supabase, no network, no JSX — the real store, a recording localStorage,
 * and a hand-built StartWorkoutResponse.
 */

// A stand-in localStorage for the zustand persist middleware. What actually
// gets written is asserted through the store's own `partialize` (C5) rather
// than through this object, so the suite does not depend on whether the runner
// hands the middleware a usable storage.
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
} as unknown as Storage;

import { useActiveWorkoutStore } from '@/store/active-workout-store';
import type { SetEntry, SetValues, StartWorkoutResponse } from '@/types/app';
import type { Readiness } from '@/types/training-context';

// ── Assertion helpers (same plain style as the Cycle 1/2 suites) ──────────────

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

// ── Accessors for the fields that do not exist yet ───────────────────────────
// Read through casts, so this file fails on *behaviour* rather than dying at a
// type error the runner would not even see.

type ContextWorkout = {
  readiness?: unknown;
  readinessPromptDismissed?: unknown;
  exercises: Array<{ sets: SetEntry[] }>;
};

type ContextStore = {
  setReadiness?: (value: Readiness | null) => void;
  dismissReadinessPrompt?: () => void;
  setSetRir?: (exerciseIndex: number, setId: string, rir: number | null) => void;
};

function store(): ContextStore & ReturnType<typeof useActiveWorkoutStore.getState> {
  return useActiveWorkoutStore.getState() as ContextStore &
    ReturnType<typeof useActiveWorkoutStore.getState>;
}

function workout(): ContextWorkout {
  const current = useActiveWorkoutStore.getState().workout;
  assert(current !== null, 'A workout is hydrated');
  return current as unknown as ContextWorkout;
}

function setReadiness(value: Readiness | null) {
  const setter = store().setReadiness;
  assert(
    typeof setter === 'function',
    'The store exposes setReadiness(value) — readiness is workout state, not a component ref',
  );
  setter!(value);
}

function dismissReadinessPrompt() {
  const dismiss = store().dismissReadinessPrompt;
  assert(
    typeof dismiss === 'function',
    'The store exposes dismissReadinessPrompt() — collapsing the strip is not the same act as answering it',
  );
  dismiss!();
}

function setSetRir(exerciseIndex: number, setId: string, rir: number | null) {
  const setter = store().setSetRir;
  assert(
    typeof setter === 'function',
    'The store exposes setSetRir(exerciseIndex, setId, rir) — a dedicated field, never a values patch',
  );
  setter!(exerciseIndex, setId, rir);
}

function sets(exerciseIndex = 0): SetEntry[] {
  return workout().exercises[exerciseIndex].sets;
}

function rirOf(set: SetEntry): unknown {
  return (set as unknown as { rir?: unknown }).rir;
}

function rirVector(exerciseIndex = 0): unknown[] {
  return sets(exerciseIndex).map(rirOf);
}

/** Every set as the comparison snapshot used to prove context changed nothing. */
function performanceSnapshot(exerciseIndex = 0) {
  return sets(exerciseIndex).map((set) => ({
    setIndex: set.setIndex,
    values: set.values,
    setType: set.setType,
    isCompleted: set.isCompleted,
    notes: set.notes,
  }));
}

// ── Fixture ──────────────────────────────────────────────────────────────────

/**
 * One exercise, warmup → three working → drop, which is the shape every
 * final-qualifying-set question needs: the last *row* is not the last
 * *qualifying* row.
 */
function startWorkoutResponse(): StartWorkoutResponse {
  const now = '2026-08-07T09:00:00.000Z';
  return {
    session: {
      id: 'ws_ctx',
      user_id: 'user-1',
      template_id: null,
      template_name: 'Push A',
      started_at: now,
      completed_at: null,
      created_at: now,
      duration_seconds: null,
      notes: null,
      is_light_session: false,
      readiness: null,
      phase_at_session: null,
    },
    exercises: [
      {
        sessionExercise: {
          id: 'se_bench',
          session_id: 'ws_ctx',
          exercise_id: 'ex_bench',
          order_index: 0,
          rest_seconds: 180,
          superset_group_id: null,
          notes: null,
        },
        exercise: {
          id: 'ex_bench',
          user_id: 'user-1',
          name: 'Barbell Bench Press',
          muscle_groups: ['chest'],
          tracking_schema: {
            fields: [
              { key: 'weight', label: 'Weight', unit: 'kg', type: 'number', optional: false },
              { key: 'reps', label: 'Reps', type: 'number', optional: false },
            ],
          },
          unit_config: 'metric',
          default_rest_seconds: 180,
          is_archived: false,
          notes: null,
          created_at: now,
          updated_at: now,
        },
        lastPerformance: [
          { set_index: 0, values: { weight: 55, reps: 10 }, set_type: 'warmup' },
          { set_index: 1, values: { weight: 80, reps: 3 }, set_type: 'working' },
          { set_index: 2, values: { weight: 75, reps: 4 }, set_type: 'working' },
          { set_index: 3, values: { weight: 70, reps: 5 }, set_type: 'working' },
          { set_index: 4, values: { weight: 60, reps: 8 }, set_type: 'drop' },
        ],
        aiSuggestion: null,
        prefilledSets: [
          { setIndex: 0, values: { weight: 55, reps: 10 }, setType: 'warmup' as const },
          { setIndex: 1, values: { weight: 80, reps: 3 }, setType: 'working' as const },
          { setIndex: 2, values: { weight: 75, reps: 4 }, setType: 'working' as const },
          { setIndex: 3, values: { weight: 70, reps: 5 }, setType: 'working' as const },
          { setIndex: 4, values: { weight: 60, reps: 8 }, setType: 'drop' as const },
        ],
      },
    ],
  };
}

/** A fresh workout for each case — the store is a module singleton. */
function hydrate(): void {
  useActiveWorkoutStore.getState().clearWorkout();
  useActiveWorkoutStore.getState().hydrateWorkout(startWorkoutResponse());
}

/** Complete every working set, so the last one is genuinely eligible for RIR. */
function completeWorkingSets(): void {
  for (const set of sets()) {
    if (set.setType === 'working') {
      useActiveWorkoutStore.getState().completeSet(0, set.id);
    }
  }
}

/** The final working/top set — the only one that may ever hold RIR. */
function finalQualifyingSet(): SetEntry {
  const qualifying = sets().filter((set) => set.setType === 'working' || set.setType === 'top');
  return qualifying[qualifying.length - 1];
}

console.log('Running Active-workout context state (Cycle 3) tests...\n');

// ── C1: a fresh workout has no readiness and no RIR ──────────────────────────
function testHydrationStartsWithNoContext() {
  console.log('C1: hydrateWorkout starts with readiness null, prompt undismissed and every RIR null');

  hydrate();

  assertEqual(
    workout().readiness,
    null,
    'readiness starts null — "not asked yet", which is also what Skip leaves behind',
  );
  assertEqual(
    workout().readinessPromptDismissed,
    false,
    'The one-time strip has not been answered, so the workout page can show it once',
  );
  assertEqual(
    rirVector(),
    [null, null, null, null, null],
    'Every hydrated set carries an explicit rir of null — absence is not RIR 0',
  );

  // Cycle 1's separation is untouched by the new fields.
  assertEqual(
    sets().map((set) => set.values),
    [{}, {}, {}, {}, {}] as SetValues[],
    'Editable values are still blank; Last performance and the orange target stay display-only',
  );

  console.log('  ✓ readiness null, prompt open, five null RIRs, blank values');
}

// ── C2: choosing a readiness stores it and answers the prompt ────────────────
function testReadinessSelection() {
  console.log('\nC2: each of the four levels is stored, and stays correctable');

  for (const level of ['high', 'normal', 'low', 'very_low'] as const) {
    hydrate();
    const before = performanceSnapshot();

    setReadiness(level);

    assertEqual(workout().readiness, level, `${level} is stored on the active workout`);
    assertEqual(
      workout().readinessPromptDismissed,
      false,
      'Choosing a level does not collapse the strip — the lifter can correct it before finishing',
    );
    assertEqual(
      performanceSnapshot(),
      before,
      'Readiness changed no set values, no set type, no completion and no ordering',
    );
    assertEqual(rirVector(), [null, null, null, null, null], 'And it did not invent an RIR');
  }

  console.log('  ✓ high / normal / low / very_low stored, strip still open, sets untouched');
}

// ── C3: Skip stores nothing and blocks nothing ───────────────────────────────
function testSkipStoresNothingAndBlocksNothing() {
  console.log('\nC3: Skip leaves readiness null, collapses the strip, and logging carries on');

  hydrate();
  const before = performanceSnapshot();

  // Skip, exactly as the strip performs it: no selection, and the prompt goes.
  setReadiness(null);
  dismissReadinessPrompt();

  assertEqual(workout().readiness, null, 'Skip stores no selection — null, never a fabricated "normal"');
  assertEqual(
    workout().readinessPromptDismissed,
    true,
    'And the strip collapses, so it is genuinely one-time',
  );
  assertEqual(performanceSnapshot(), before, 'Skip changed no editable value and completed nothing');

  // Nothing about the workout is gated on having answered.
  const target = sets()[1];
  useActiveWorkoutStore.getState().updateSet(0, target.id, { values: { weight: 82.5, reps: 5 } });
  useActiveWorkoutStore.getState().completeSet(0, target.id);

  assertEqual(sets()[1].values, { weight: 82.5, reps: 5 }, 'A set logs normally after Skip');
  assertEqual(sets()[1].isCompleted, true, 'And completes normally');
  assertEqual(workout().readiness, null, 'Logging did not backfill a readiness the user declined to give');

  // Skipping *after* choosing is a deliberate clear, not a second question.
  setReadiness('low');
  setReadiness(null);
  assertEqual(workout().readiness, null, 'Clearing a chosen readiness returns to null');

  console.log('  ✓ null stored, strip collapsed, set logged and completed afterwards');
}

// ── C4: an unreadable readiness is dropped, never mapped onto a level ────────
function testInvalidReadinessIsDropped() {
  console.log('\nC4: junk readiness becomes null rather than the nearest level');

  for (const junk of ['exhausted', 'HIGH', 'medium', '', ' ', 0, 1, {}, []] as unknown[]) {
    hydrate();
    setReadiness(junk as Readiness);
    assertEqual(
      workout().readiness,
      null,
      `An unrecognised readiness (${JSON.stringify(junk)}) is null — it must never reach chk_session_readiness`,
    );
  }

  console.log('  ✓ nine unreadable inputs → null');
}

// ── C5: readiness belongs to this workout, and survives a refresh ────────────
function testReadinessIsPerWorkoutAndPersisted() {
  console.log('\nC5: readiness is persisted with the active workout and never becomes a user default');

  hydrate();
  setReadiness('low');

  // Exactly what the persist middleware writes: the store's own partialize,
  // JSON round-tripped the way the storage layer round-trips it.
  const options = useActiveWorkoutStore.persist.getOptions();
  assertEqual(options.name, 'liftos-active-workout', 'The existing active-workout key is unchanged');
  assert(typeof options.partialize === 'function', 'The store still partializes what it persists');
  function persistedWorkout(): ContextWorkout | null {
    return (
      JSON.parse(JSON.stringify(options.partialize!(useActiveWorkoutStore.getState()))) as {
        workout: ContextWorkout | null;
      }
    ).workout;
  }

  assertEqual(
    persistedWorkout()?.readiness,
    'low',
    'A refresh mid-workout restores the readiness the lifter already gave',
  );

  dismissReadinessPrompt();
  assertEqual(
    persistedWorkout()?.readinessPromptDismissed,
    true,
    'And an answered strip stays answered across the refresh — it is not asked twice in one workout',
  );

  // The next workout asks again. Readiness is a property of a session, not of
  // the user: yesterday's "very_low" must not silently label today's session.
  hydrate();
  assertEqual(workout().readiness, null, 'A new workout starts unasked');
  assertEqual(workout().readinessPromptDismissed, false, 'And shows the strip again');

  console.log('  ✓ persisted under liftos-active-workout, reset by the next hydrate');
}

// ── C6: RIR stores 0–3, and 3 is the "3+" the UI shows ───────────────────────
function testRirStoresZeroToThree() {
  console.log('\nC6: 0, 1, 2 and 3 are stored as integers, and 3 is the stored form of "3+"');

  for (const value of [0, 1, 2, 3]) {
    hydrate();
    completeWorkingSets();
    const target = finalQualifyingSet();

    setSetRir(0, target.id, value);

    const stored = rirOf(sets().find((set) => set.id === target.id)!);
    assertEqual(stored, value, `The UI control for ${value === 3 ? '3+' : value} stores numeric ${value}`);
    assert(
      typeof stored === 'number',
      'RIR is an integer column — a "3+" string would fail RirSchema and be lost on the way to the database',
    );
    assertEqual(
      rirVector().filter((rir) => rir !== null).length,
      1,
      'Exactly one set in the exercise holds RIR',
    );
  }

  console.log('  ✓ 0 / 1 / 2 / 3 stored as numbers, "3+" is 3, one holder');
}

// ── C7: clearing produces null, not 0 ────────────────────────────────────────
function testClearingProducesNull() {
  console.log('\nC7: Clear stores null — "did not say", which is not "had nothing left"');

  hydrate();
  completeWorkingSets();
  const target = finalQualifyingSet();

  setSetRir(0, target.id, 3);
  assertEqual(rirOf(sets().find((set) => set.id === target.id)!), 3, 'Recorded first');

  setSetRir(0, target.id, null);
  const cleared = rirOf(sets().find((set) => set.id === target.id)!);
  assertEqual(cleared, null, 'Clearing returns to null');
  assert(cleared !== 0, 'And emphatically not 0 — 0 is a maximal effort, the opposite of no answer');

  // The same for anything unreadable: a value outside 0..3 is no value.
  for (const junk of [4, -1, 2.5, '2', '3+', true, {}, NaN] as unknown[]) {
    hydrate();
    completeWorkingSets();
    const set = finalQualifyingSet();
    setSetRir(0, set.id, junk as number);
    assertEqual(
      rirOf(sets().find((entry) => entry.id === set.id)!),
      null,
      `An unusable RIR (${JSON.stringify(junk)}) is null — chk on set_entries.rir is 0..3`,
    );
  }

  console.log('  ✓ Clear → null (never 0); 4 / -1 / 2.5 / "2" / "3+" → null');
}

// ── C8: RIR never enters set.values, and never disturbs them ─────────────────
function testRirIsNotASetValue() {
  console.log('\nC8: rir is a column of its own — never a tracking field, never inside values');

  hydrate();
  completeWorkingSets();
  const target = finalQualifyingSet();
  useActiveWorkoutStore.getState().updateSet(0, target.id, { values: { weight: 70, reps: 5 } });

  const before = performanceSnapshot();
  setSetRir(0, target.id, 2);

  assertEqual(
    performanceSnapshot(),
    before,
    'Recording RIR changed no value, no set type, no completion flag and no ordering',
  );
  for (const set of sets()) {
    assert(
      !('rir' in set.values),
      'rir is never a key of values — the tracking schema describes the lift, not how it felt',
    );
  }
  assertEqual(
    sets().find((set) => set.id === target.id)!.values,
    { weight: 70, reps: 5 },
    'The weight and reps the lifter typed are exactly as they left them',
  );

  // And the traffic in the other direction: editing values keeps the RIR.
  useActiveWorkoutStore.getState().updateSet(0, target.id, { values: { weight: 72.5, reps: 5 } });
  assertEqual(
    rirOf(sets().find((set) => set.id === target.id)!),
    2,
    'Correcting the weight does not discard the RIR that was already given for that set',
  );

  console.log('  ✓ values, setType, isCompleted and order unchanged; no rir key in values');
}

// ── C9: new sets start without RIR ───────────────────────────────────────────
function testNewSetsStartNull() {
  console.log('\nC9: added sets and added exercises start with rir null');

  hydrate();
  useActiveWorkoutStore.getState().addSet(0);
  const added = sets()[sets().length - 1];
  assertEqual(rirOf(added), null, 'An added set has an explicit null rir, like a hydrated one');
  assertEqual(added.values, {}, 'And blank values, exactly as before Cycle 3');

  useActiveWorkoutStore.getState().addExercise(
    {
      id: 'se_row',
      session_id: 'ws_ctx',
      exercise_id: 'ex_row',
      order_index: 1,
      rest_seconds: 120,
      superset_group_id: null,
      notes: null,
    },
    {
      id: 'ex_row',
      user_id: 'user-1',
      name: 'Barbell Row',
      muscle_groups: ['back'],
      tracking_schema: {
        fields: [
          { key: 'weight', label: 'Weight', unit: 'kg', type: 'number', optional: false },
          { key: 'reps', label: 'Reps', type: 'number', optional: false },
        ],
      },
      unit_config: 'metric',
      default_rest_seconds: 120,
      is_archived: false,
      notes: null,
      created_at: '2026-08-07T09:00:00.000Z',
      updated_at: '2026-08-07T09:00:00.000Z',
    },
    3,
  );
  assertEqual(rirVector(1), [null, null, null], 'A newly added exercise has three sets with null rir');

  console.log('  ✓ addSet and addExercise both produce rir null');
}

// ── C10: RIR is cleared, never re-attributed (Plan Risk 3) ───────────────────
/**
 * The decision this suite pins. A set that stops being the final *completed*
 * working/top set of its exercise loses its RIR. The alternative — leaving the
 * number where it is, or letting it slide to whichever set is final now —
 * silently attributes an effort rating to a set the lifter never rated.
 */
function testRirClearsWhenTheSetStopsBeingFinal() {
  console.log('\nC10: a set that stops being the final completed working/top set loses its RIR');

  // (a) Retyped to something that never carries RIR.
  hydrate();
  completeWorkingSets();
  let target = finalQualifyingSet();
  setSetRir(0, target.id, 1);
  useActiveWorkoutStore.getState().updateSet(0, target.id, { setType: 'drop' });
  assertEqual(
    rirOf(sets().find((set) => set.id === target.id)!),
    null,
    'A working set retyped to drop is no longer a qualifying set, so its RIR is cleared',
  );
  assertEqual(rirVector().filter((rir) => rir !== null).length, 0, 'And it did not move to another row');

  // (b) Un-completed again. RIR describes a set that was performed.
  hydrate();
  completeWorkingSets();
  target = finalQualifyingSet();
  setSetRir(0, target.id, 0);
  useActiveWorkoutStore.getState().completeSet(0, target.id); // toggles back to incomplete
  assertEqual(sets().find((set) => set.id === target.id)!.isCompleted, false, 'The set is open again');
  assertEqual(
    rirOf(sets().find((set) => set.id === target.id)!),
    null,
    'An un-completed set holds no RIR — and 0 in particular must not survive as a stray "nothing left"',
  );

  // (c) A further qualifying set is added after it.
  hydrate();
  completeWorkingSets();
  target = finalQualifyingSet();
  setSetRir(0, target.id, 2);
  useActiveWorkoutStore.getState().addSet(0);
  assertEqual(
    rirOf(sets().find((set) => set.id === target.id)!),
    null,
    'Adding another working set makes the rated one no longer final, so its rating is cleared',
  );
  assertEqual(
    rirVector().filter((rir) => rir !== null).length,
    0,
    'The 2 is not silently transferred to the new, unperformed set',
  );

  // (d) Deleted outright.
  hydrate();
  completeWorkingSets();
  target = finalQualifyingSet();
  setSetRir(0, target.id, 3);
  useActiveWorkoutStore.getState().deleteSet(0, target.id);
  assertEqual(
    rirVector().filter((rir) => rir !== null).length,
    0,
    'Deleting the rated set takes its rating with it — the set before it is not retroactively rated 3',
  );

  console.log('  ✓ retype / un-complete / append / delete all clear, and never re-attribute');
}

// ── C11: only one set per exercise can hold RIR ──────────────────────────────
function testOnlyOneSetHoldsRir() {
  console.log('\nC11: rating the final set does not leave a rating on an earlier one');

  hydrate();
  completeWorkingSets();
  const qualifying = sets().filter((set) => set.setType === 'working');
  const middle = qualifying[1];
  const last = qualifying[qualifying.length - 1];

  // Whatever route the UI takes, the invariant is the same: at most one
  // non-null rir per exercise, and it is the final completed qualifying set.
  setSetRir(0, last.id, 1);
  setSetRir(0, middle.id, 2);

  const holders = sets().filter((set) => rirOf(set) !== null);
  assertEqual(holders.length, 1, 'At most one set per exercise carries RIR');
  assertEqual(
    holders[0].id === last.id,
    true,
    'And it is the final completed working set — a preceding set is not an eligible target',
  );

  console.log('  ✓ one holder, and it is the final completed working set');
}

function main() {
  testHydrationStartsWithNoContext();
  testReadinessSelection();
  testSkipStoresNothingAndBlocksNothing();
  testInvalidReadinessIsDropped();
  testReadinessIsPerWorkoutAndPersisted();
  testRirStoresZeroToThree();
  testClearingProducesNull();
  testRirIsNotASetValue();
  testNewSetsStartNull();
  testRirClearsWhenTheSetStopsBeingFinal();
  testOnlyOneSetHoldsRir();

  console.log('\n✅ All Active-workout context state (Cycle 3) tests passed!');
  console.log('Coverage verified:');
  console.log('  ✓ A hydrated workout has readiness null, an unanswered strip and five null RIRs');
  console.log('  ✓ high / normal / low / very_low are stored without touching any set');
  console.log('  ✓ Skip stores null, collapses the strip, and blocks no logging');
  console.log('  ✓ Unreadable readiness is dropped rather than mapped onto a level');
  console.log('  ✓ Readiness persists with the active workout and resets for the next one');
  console.log('  ✓ 0 / 1 / 2 / 3 store as integers; "3+" is 3; Clear is null, never 0');
  console.log('  ✓ rir never enters values, and editing values never discards it');
  console.log('  ✓ Added sets and exercises start with rir null');
  console.log('  ✓ A set that stops being the final completed working/top set loses its RIR');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
