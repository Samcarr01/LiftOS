/**
 * Cycle 1 — Data safety — RED — `setIndex` is a persisted key, not a position
 *
 * Run with: npx tsx src/store/__tests__/set-index-stability.spec.ts
 *
 * Contract (approved, part 1):
 *   A completed set is queued for offline sync by its persisted key
 *   (session_exercise_id, set_index). Sets that have been completed must not
 *   have their persisted set_index silently reassigned by deletion of a
 *   different set. Adding a set after a deletion must allocate a fresh,
 *   non-colliding persisted index.
 *
 * Why this is a data-safety bug and not a cosmetics bug
 * -----------------------------------------------------
 * `logSetEntry` (src/lib/offline/index.ts) queues each completed set as
 * `{ session_exercise_id, set_index, values, ... }`, and the server upserts on
 * that pair. So `setIndex` is not "the position of this row in the list" — it
 * is the primary key the row will be written under, and it is *already in
 * flight* the instant the set is completed.
 *
 * `deleteSet` currently renumbers every surviving set with
 * `.map((st, i) => ({ ...st, setIndex: i }))`. Delete one set and every
 * completed set after it silently adopts a key that already belongs to a
 * different set's queued write. When the queue drains, those upserts land on
 * each other: one set's weight and reps overwrite another's, and a real logged
 * set disappears. The lifter sees a workout they did not do.
 *
 * `addSet` has the mirror problem. It takes `setIndex: ex.sets.length`, which
 * is only ever collision-free because deletion renumbers. Stop renumbering
 * without fixing allocation and the very next added set claims a key a
 * retained completed set is already using — the same silent overwrite, from
 * the other end.
 *
 * These two live together on purpose: fixing one without the other just moves
 * the collision.
 *
 * Scope
 * -----
 * Only *completed* sets are protected here. A set that was never completed has
 * never been queued and owns no key yet, so renumbering it harms nothing — the
 * suite deliberately does not pin its number, only that whatever number it ends
 * up with does not collide with a key someone else already owns (S4, S5).
 *
 * No Supabase, no network, no JSX — the real store and a hand-built
 * StartWorkoutResponse.
 */

// A stand-in localStorage for the zustand persist middleware, matching the
// sibling store suite. Nothing here asserts on what was written to it.
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
} as unknown as Storage;

import { useActiveWorkoutStore } from '@/store/active-workout-store';
import type { SetEntry, StartWorkoutResponse } from '@/types/app';

// ── Assertion helpers (same plain style as the Cycle 1/2/3 suites) ────────────

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

// ── Store accessors ──────────────────────────────────────────────────────────

function store() {
  return useActiveWorkoutStore.getState();
}

function sets(exerciseIndex = 0): SetEntry[] {
  const current = store().workout;
  assert(current !== null, 'A workout is hydrated');
  return current!.exercises[exerciseIndex].sets;
}

/**
 * The high-watermark must live inside the persisted active-workout payload.
 * Dexie's queue survives a browser close; module memory does not. A deleted key
 * therefore stays retired across a reload until the workout itself is cleared.
 */
function issuedKeyHighWatermark(sessionExerciseId: string): unknown {
  const current = store().workout as {
    issuedSetIndexHighWatermarks?: Record<string, number>;
  } | null;
  return current?.issuedSetIndexHighWatermarks?.[sessionExerciseId];
}

/** The persisted key each set would be written under, in list order. */
function indexVector(exerciseIndex = 0): number[] {
  return sets(exerciseIndex).map((set) => set.setIndex);
}

/** Every persisted key currently claimed by any set in the exercise. */
function claimedIndexes(exerciseIndex = 0): number[] {
  return indexVector(exerciseIndex);
}

function setAt(position: number, exerciseIndex = 0): SetEntry {
  const set = sets(exerciseIndex)[position];
  assert(set !== undefined, `There is a set at list position ${position}`);
  return set;
}

/** Find a set by the persisted key it holds — the identity the server sees. */
function setWithIndex(setIndex: number, exerciseIndex = 0): SetEntry | undefined {
  return sets(exerciseIndex).find((set) => set.setIndex === setIndex);
}

// ── Fixture ──────────────────────────────────────────────────────────────────

/**
 * One exercise, five sets — warmup, three working, drop. Five is enough that a
 * deletion in the middle has sets on both sides of it.
 */
function startWorkoutResponse(): StartWorkoutResponse {
  const now = '2026-08-09T09:00:00.000Z';
  return {
    session: {
      id: 'ws_safety',
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
          session_id: 'ws_safety',
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
        lastPerformance: null,
        aiSuggestion: null,
        prefilledSets: [
          { setIndex: 0, values: { weight: 40, reps: 10 }, setType: 'warmup' as const },
          { setIndex: 1, values: { weight: 80, reps: 5 }, setType: 'working' as const },
          { setIndex: 2, values: { weight: 80, reps: 5 }, setType: 'working' as const },
          { setIndex: 3, values: { weight: 80, reps: 5 }, setType: 'working' as const },
          { setIndex: 4, values: { weight: 60, reps: 8 }, setType: 'drop' as const },
        ],
      },
    ],
  };
}

/** A fresh workout for each case — the store is a module singleton. */
function hydrate(): void {
  store().clearWorkout();
  store().hydrateWorkout(startWorkoutResponse());
}

/**
 * Log every set, with a distinct payload per set so a key collision shows up as
 * the wrong numbers rather than as a coincidence.
 */
function completeEverySet(): void {
  for (const set of sets()) {
    store().updateSet(0, set.id, { values: { weight: 100 + set.setIndex, reps: set.setIndex } });
    store().completeSet(0, set.id);
  }
}

console.log('Running Set index stability (Cycle 1 data safety) tests...\n');

// ── S1: deleting a set does not renumber the completed sets after it ─────────
function testDeleteKeepsCompletedIndexes() {
  console.log('S1: deleting one set leaves every other completed set on its own persisted key');

  hydrate();
  completeEverySet();
  assertEqual(indexVector(), [0, 1, 2, 3, 4], 'Precondition: five completed sets on keys 0..4');

  const doomed = setWithIndex(2)!;
  const survivors = sets()
    .filter((set) => set.id !== doomed.id)
    .map((set) => ({ id: set.id, setIndex: set.setIndex, values: set.values }));

  store().deleteSet(0, doomed.id);

  assertEqual(sets().length, 4, 'The deleted set is gone from the list');
  assert(sets().every((set) => set.id !== doomed.id), 'The deleted set is gone by identity');

  for (const survivor of survivors) {
    const current = sets().find((set) => set.id === survivor.id);
    assert(current !== undefined, `Survivor ${survivor.setIndex} is still in the list`);
    assertEqual(
      current!.setIndex,
      survivor.setIndex,
      `A completed set keeps the key its queued write already used — set ${survivor.setIndex} must not be renumbered by deleting set 2`,
    );
    assertEqual(
      current!.values,
      survivor.values,
      `Set ${survivor.setIndex} keeps its own values — a renumber would land another set's payload here`,
    );
  }

  assertEqual(
    indexVector(),
    [0, 1, 3, 4],
    'The surviving keys are exactly the ones the queue is already carrying — a gap is correct, 0..3 is data loss',
  );

  console.log('  ✓ deleting set 2 leaves keys 0, 1, 3, 4 intact');
}

// ── S2: deleting the first set does not shift everything onto a neighbour ────
function testDeleteFirstSet() {
  console.log('S2: deleting the first set does not slide four queued writes down one key');

  hydrate();
  completeEverySet();

  const first = setWithIndex(0)!;
  store().deleteSet(0, first.id);

  assertEqual(
    indexVector(),
    [1, 2, 3, 4],
    'Deleting key 0 must not turn keys 1..4 into 0..3 — every one of those writes is already queued under its old key',
  );

  const stillWorking = setWithIndex(1);
  assert(stillWorking !== undefined, 'The set that was key 1 is still key 1');
  assertEqual(
    stillWorking!.values,
    { weight: 101, reps: 1 },
    'The set on key 1 still carries the payload that was queued under key 1',
  );

  console.log('  ✓ deleting key 0 leaves keys 1, 2, 3, 4 intact');
}

// ── S3: a set that was never completed owns no key and may be renumbered ─────
function testUncompletedSetIsNotPinned() {
  console.log('S3: deleting an uncompleted set is safe regardless of how the rest are numbered');

  hydrate();
  // Complete only keys 0 and 1 — those two are queued; 2, 3, 4 are not.
  for (const set of sets().slice(0, 2)) {
    store().completeSet(0, set.id);
  }

  const queued = sets()
    .filter((set) => set.isCompleted)
    .map((set) => ({ id: set.id, setIndex: set.setIndex }));

  store().deleteSet(0, setAt(4).id); // the never-completed drop set

  for (const q of queued) {
    const current = sets().find((set) => set.id === q.id);
    assert(current !== undefined, 'A completed set survives deletion of an unrelated set');
    assertEqual(
      current!.setIndex,
      q.setIndex,
      'A completed set keeps its key even when the deleted set was never completed',
    );
  }

  assertEqual(
    new Set(claimedIndexes()).size,
    claimedIndexes().length,
    'Every set in the exercise still holds a distinct key',
  );

  console.log('  ✓ queued keys survive; keys stay distinct');
}

// ── S4: adding after a deletion allocates a fresh key ────────────────────────
function testAddSetAfterDeleteDoesNotCollide() {
  console.log('S4: a set added after a deletion gets a key nobody is already using');

  hydrate();
  completeEverySet();

  store().deleteSet(0, setWithIndex(2)!.id);
  const claimedBefore = claimedIndexes();

  store().addSet(0);

  const added = sets()[sets().length - 1];
  assert(!added.isCompleted, 'Precondition: the added set is the new, uncompleted one');
  assert(
    !claimedBefore.includes(added.setIndex),
    `An added set must claim a fresh key — key ${added.setIndex} is already carrying a queued write (claimed: ${JSON.stringify(claimedBefore)})`,
  );
  assertEqual(
    new Set(claimedIndexes()).size,
    claimedIndexes().length,
    'After adding, every set still holds a distinct key — (session_exercise_id, set_index) must stay a key',
  );

  console.log('  ✓ the added set claims a key outside the queued set');
}

// ── S5: repeated delete/add churn never re-issues a key ──────────────────────
function testChurnNeverReissuesAKey() {
  console.log('S5: delete/add churn never hands out a key that was already used this session');

  hydrate();
  completeEverySet();

  // Every key this exercise has ever issued. A key that was queued and then
  // deleted must not come back either — the server row may already exist, and a
  // brand new set inheriting it would overwrite a row the lifter deleted.
  const everIssued = new Set(claimedIndexes());

  for (let round = 0; round < 3; round += 1) {
    const victim = sets()[1];
    store().deleteSet(0, victim.id);

    store().addSet(0);
    const added = sets()[sets().length - 1];
    assert(
      !everIssued.has(added.setIndex),
      `Round ${round}: key ${added.setIndex} was issued earlier in this session and must not be re-used (issued: ${JSON.stringify([...everIssued])})`,
    );
    everIssued.add(added.setIndex);

    store().completeSet(0, added.id);

    assertEqual(
      new Set(claimedIndexes()).size,
      claimedIndexes().length,
      `Round ${round}: keys stay distinct across churn`,
    );
  }

  console.log('  ✓ three rounds of delete-then-add, no key re-issued');
}

// ── S5b: the high-watermark survives the browser reload boundary ────────────
function testIssuedKeyWatermarkIsPersisted() {
  console.log('S5b: retired keys remain retired after browser reload because the watermark is persisted');

  hydrate();
  completeEverySet();
  store().deleteSet(0, setWithIndex(4)!.id);

  assertEqual(
    issuedKeyHighWatermark('se_bench'),
    4,
    'The active-workout payload retains the highest issued key, including the deleted key 4 — module memory is lost on reload but the offline queue survives',
  );

  console.log('  ✓ persisted active-workout state retains the retired key watermark');
}

// ── S6: nothing else about a set moves ───────────────────────────────────────
function testDeleteChangesNothingElse() {
  console.log('S6: pinning the key does not freeze anything else about the list');

  hydrate();
  completeEverySet();

  const before = sets().map((set) => ({
    id: set.id,
    values: set.values,
    setType: set.setType,
    isCompleted: set.isCompleted,
  }));

  const doomed = setWithIndex(3)!;
  store().deleteSet(0, doomed.id);

  const expected = before.filter((set) => set.id !== doomed.id);
  const actual = sets().map((set) => ({
    id: set.id,
    values: set.values,
    setType: set.setType,
    isCompleted: set.isCompleted,
  }));

  assertEqual(
    actual,
    expected,
    'Deletion removes exactly one row and leaves order, values, type and completion untouched',
  );

  console.log('  ✓ one row removed, order and payloads unchanged');
}

testDeleteKeepsCompletedIndexes();
testDeleteFirstSet();
testUncompletedSetIsNotPinned();
testAddSetAfterDeleteDoesNotCollide();
testChurnNeverReissuesAKey();
testIssuedKeyWatermarkIsPersisted();
testDeleteChangesNothingElse();

console.log('\n✅ All Set index stability (Cycle 1 data safety) tests passed!');
console.log('Coverage verified:');
console.log('  ✓ Deleting a set leaves every other completed set on its own persisted key');
console.log('  ✓ Deleting the first set does not slide queued writes down one key');
console.log('  ✓ Deleting a never-completed set disturbs no queued key');
console.log('  ✓ A set added after a deletion claims a key nobody holds');
console.log('  ✓ Delete/add churn never re-issues a key from this session');
console.log('  ✓ Removal changes exactly one row and nothing else');
