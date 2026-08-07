/**
 * Cycle 3 — the online completion payload the browser actually sends
 *
 * Run with: npx tsx src/components/workout/__tests__/completion-payload.spec.ts
 *
 * Plan: .hermes/plans/2026-08-07_cycle-3-workout-context-capture.md Task 5.
 *
 * Cycle 2 released the whole server half of this: `CompleteWorkoutRequestSchema`
 * accepts nullable readiness and per-set RIR, `buildSetEntryUpsertRows` gives
 * every row a uniform `rir` key, and `api/workouts/complete/route.ts` reads the
 * phase from the authenticated user row. What was missing is the request the
 * browser builds. `buildCompleteWorkoutRequestBody` is that request, extracted
 * from `FinishDialog` so its shape is assertable without a network or a dialog.
 *
 * Four properties matter:
 *
 *   1. The zero-context path still completes. A lifter who skipped readiness
 *      and never touched RIR sends `readiness: null` and `rir: null`, and the
 *      released request schema accepts it unchanged.
 *   2. Keys are uniform. Every set object carries `rir`, `null` included —
 *      PostgREST derives a bulk upsert's column list from its first row, so one
 *      omitted key would drop the column for the entire batch.
 *   3. `null` is not `0`. "Didn't say" and "nothing left in the tank" are
 *      different answers and must stay different all the way to the column.
 *   4. No phase, in any form. `phase_at_session` is the server's to stamp from
 *      the authenticated user row; a browser that could name its own phase
 *      could relabel its own history.
 *
 * The real store builds the workout, so this suite exercises the same objects
 * the dialog would read at Save Workout.
 */

// The zustand persist middleware wants a storage before the store module loads.
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
} as unknown as Storage;

import { buildCompleteWorkoutRequestBody } from '../finish-dialog';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { CompleteWorkoutRequestSchema } from '@/lib/validation';
import {
  buildSessionCompletionPatch,
  buildSetEntryUpsertRows,
} from '@/lib/workout/complete-workout-persistence';
import type { ActiveWorkoutState, SetEntry, StartWorkoutResponse } from '@/types/app';

// ── Assertion helpers (same plain style as the Cycle 1/2/3 suites) ───────────

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedStr}\n  actual:   ${actualStr}`);
  }
}

// ── Fixture ──────────────────────────────────────────────────────────────────

// Real UUIDs, so the released request schema can be run against the body rather
// than only inspected.
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const BENCH_ID = '22222222-2222-4222-8222-222222222222';
const ROW_ID = '33333333-3333-4333-8333-333333333333';

/**
 * Two exercises: a bench with warmup → three working → drop (so the last *row*
 * is not the last *qualifying* row), and a row with a single working set.
 */
function startWorkoutResponse(): StartWorkoutResponse {
  const now = '2026-08-07T09:00:00.000Z';
  const schema = {
    fields: [
      { key: 'weight', label: 'Weight', unit: 'kg', type: 'number' as const, optional: false },
      { key: 'reps', label: 'Reps', type: 'number' as const, optional: false },
    ],
  };

  return {
    session: {
      id: SESSION_ID,
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
          id: BENCH_ID,
          session_id: SESSION_ID,
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
          tracking_schema: schema,
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
          { setIndex: 0, values: { weight: 55, reps: 10 }, setType: 'warmup' as const },
          { setIndex: 1, values: { weight: 80, reps: 3 }, setType: 'working' as const },
          { setIndex: 2, values: { weight: 75, reps: 4 }, setType: 'working' as const },
          { setIndex: 3, values: { weight: 70, reps: 5 }, setType: 'working' as const },
          { setIndex: 4, values: { weight: 60, reps: 8 }, setType: 'drop' as const },
        ],
      },
      {
        sessionExercise: {
          id: ROW_ID,
          session_id: SESSION_ID,
          exercise_id: 'ex_row',
          order_index: 1,
          rest_seconds: 120,
          superset_group_id: null,
          notes: null,
        },
        exercise: {
          id: 'ex_row',
          user_id: 'user-1',
          name: 'Barbell Row',
          muscle_groups: ['back'],
          tracking_schema: schema,
          unit_config: 'metric',
          default_rest_seconds: 120,
          is_archived: false,
          notes: null,
          created_at: now,
          updated_at: now,
        },
        lastPerformance: null,
        aiSuggestion: null,
        prefilledSets: [
          { setIndex: 0, values: { weight: 70, reps: 10 }, setType: 'working' as const },
        ],
      },
    ],
  };
}

function hydrate(): void {
  useActiveWorkoutStore.getState().clearWorkout();
  useActiveWorkoutStore.getState().hydrateWorkout(startWorkoutResponse());
}

function workout(): ActiveWorkoutState {
  const state = useActiveWorkoutStore.getState().workout;
  if (!state) throw new Error('No active workout');
  return state;
}

function sets(exerciseIndex: number): SetEntry[] {
  return workout().exercises[exerciseIndex].sets;
}

/** Log the values the lifter typed and tick each working set off. */
function performWorkingSets(): void {
  const store = useActiveWorkoutStore.getState;
  for (const [exerciseIndex, exercise] of workout().exercises.entries()) {
    for (const set of exercise.sets) {
      if (set.setType !== 'working') continue;
      store().updateSet(exerciseIndex, set.id, { values: { weight: 80, reps: 5 } });
      store().completeSet(exerciseIndex, set.id);
    }
  }
}

/** The final working/top set of an exercise — the only one that may hold RIR. */
function finalQualifyingSet(exerciseIndex: number): SetEntry {
  const qualifying = sets(exerciseIndex).filter((set) => set.setType === 'working' || set.setType === 'top');
  return qualifying[qualifying.length - 1];
}

/** Every key that appears anywhere in the serialized body, at any depth. */
function allKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, found);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      allKeys(child, found);
    }
  }
  return found;
}

console.log('Running completion payload (Cycle 3) tests...\n');

// ── P1: the normal path — nothing optional was answered ─────────────────────
function testZeroContextPathCompletes() {
  console.log('P1: a workout with no readiness and no RIR still produces a valid request');

  hydrate();
  performWorkingSets();

  const body = buildCompleteWorkoutRequestBody(workout());

  assertEqual(body.sessionId, SESSION_ID, 'The session being completed');
  assertEqual(body.isLightSession, false, 'The existing light-session flag is untouched');
  assertEqual(body.readiness, null, 'Never asked and never answered is null — not a fabricated "normal"');
  assertEqual(
    body.exercises.flatMap((exercise) => exercise.sets.map((set) => set.rir)),
    [null, null, null, null, null, null],
    'Every set sends an explicit null RIR — absence is not RIR 0',
  );

  // The released request schema is the real acceptance test for this shape.
  const parsed = CompleteWorkoutRequestSchema.safeParse(body);
  assert(parsed.success, `The zero-context body passes CompleteWorkoutRequestSchema: ${JSON.stringify(parsed.error?.issues)}`);
  assertEqual(parsed.data?.readiness, null, 'And it survives parsing as null');

  // Cycle 1's separation: the payload carries what the lifter typed, nothing
  // the recommendation suggested.
  const benchWorking = body.exercises[0].sets.filter((set) => set.setType === 'working');
  assertEqual(
    benchWorking.map((set) => set.values),
    [{ weight: 80, reps: 5 }, { weight: 80, reps: 5 }, { weight: 80, reps: 5 }],
    'The values sent are the user-entered ones',
  );
  assertEqual(body.exercises[0].sets[0].values, {}, 'An untouched set sends the blank values it was hydrated with');

  console.log('  ✓ readiness null, six null RIRs, schema-valid, values untouched');
}

// ── P2: each readiness level reaches the request ─────────────────────────────
function testReadinessReachesTheRequest() {
  console.log('\nP2: a chosen readiness is sent; Skip sends null');

  for (const level of ['high', 'normal', 'low', 'very_low'] as const) {
    hydrate();
    useActiveWorkoutStore.getState().setReadiness(level);
    const body = buildCompleteWorkoutRequestBody(workout());
    assertEqual(body.readiness, level, `${level} reaches the completion request`);
    assert(CompleteWorkoutRequestSchema.safeParse(body).success, `${level} is accepted by the request schema`);
  }

  // Skip: the store's own two-step — no selection, strip collapsed.
  hydrate();
  useActiveWorkoutStore.getState().setReadiness('low');
  useActiveWorkoutStore.getState().setReadiness(null);
  useActiveWorkoutStore.getState().dismissReadinessPrompt();
  const skipped = buildCompleteWorkoutRequestBody(workout());
  assertEqual(skipped.readiness, null, 'Skipping after a selection sends null, not the abandoned answer');
  assert(
    !('readinessPromptDismissed' in skipped),
    'Whether the strip is on screen is the client\'s business and is never sent',
  );

  console.log('  ✓ high / normal / low / very_low sent; Skip sends null; no UI state leaks');
}

// ── P3: only the final completed working set carries RIR ─────────────────────
function testOnlyTheFinalWorkingSetCarriesRir() {
  console.log('\nP3: exactly one set per exercise carries RIR, and every row still has the key');

  hydrate();
  performWorkingSets();

  const bench = finalQualifyingSet(0);
  const row = finalQualifyingSet(1);
  useActiveWorkoutStore.getState().setSetRir(0, bench.id, 2);
  useActiveWorkoutStore.getState().setSetRir(1, row.id, 0);

  const body = buildCompleteWorkoutRequestBody(workout());

  assertEqual(
    body.exercises[0].sets.map((set) => [set.setIndex, set.setType, set.rir]),
    [
      [0, 'warmup', null],
      [1, 'working', null],
      [2, 'working', null],
      [3, 'working', 2],
      [4, 'drop', null],
    ],
    'The warmup, the earlier working sets and the trailing drop set all send null; only the last working set carries 2',
  );
  assertEqual(body.exercises[1].sets.map((set) => set.rir), [0], 'A deliberate 0 is sent as 0');

  // Uniform keys: PostgREST reads the column list off the first row.
  const keySets = body.exercises.flatMap((exercise) => exercise.sets.map((set) => Object.keys(set).sort()));
  for (const keys of keySets) {
    assertEqual(
      keys,
      ['isCompleted', 'loggedAt', 'notes', 'rir', 'setIndex', 'setType', 'values'],
      'Every set object has an identical key set, rir included',
    );
  }

  // And the released row builder turns that into what the column expects.
  const rows = buildSetEntryUpsertRows(body.exercises);
  assertEqual(
    rows.map((r) => r.rir),
    [null, null, null, 2, null, 0],
    'The upsert rows keep null-vs-0 exactly as the payload stated it',
  );

  console.log('  ✓ one holder per exercise, uniform keys, 0 preserved, null preserved');
}

// ── P4: 3 is the stored "3+", and clearing gives null, never 0 ───────────────
function testRirEncodingSurvivesTheRequest() {
  console.log('\nP4: 0 / 1 / 2 / 3 all reach the request, and Clear sends null');

  for (const rir of [0, 1, 2, 3] as const) {
    hydrate();
    performWorkingSets();
    useActiveWorkoutStore.getState().setSetRir(0, finalQualifyingSet(0).id, rir);
    const body = buildCompleteWorkoutRequestBody(workout());
    assertEqual(body.exercises[0].sets[3].rir, rir, `RIR ${rir} reaches the request unchanged`);
    const parsed = CompleteWorkoutRequestSchema.safeParse(body);
    assert(parsed.success, `RIR ${rir} is accepted by the request schema`);
    assertEqual(parsed.data?.exercises[0].sets[3].rir, rir, `RIR ${rir} survives parsing — 3 is the UI's "3+"`);
  }

  hydrate();
  performWorkingSets();
  useActiveWorkoutStore.getState().setSetRir(0, finalQualifyingSet(0).id, 3);
  useActiveWorkoutStore.getState().setSetRir(0, finalQualifyingSet(0).id, null);
  const cleared = buildCompleteWorkoutRequestBody(workout());
  assertEqual(cleared.exercises[0].sets[3].rir, null, 'Clearing sends null — never 0, which means "nothing left"');

  console.log('  ✓ 0 / 1 / 2 / 3 round-trip through the schema; Clear is null');
}

// ── P5: the browser never names a phase ──────────────────────────────────────
function testNoPhaseIsEverSent() {
  console.log('\nP5: no phase field is sent, and the server\'s phase is what gets stamped');

  hydrate();
  performWorkingSets();
  useActiveWorkoutStore.getState().setReadiness('low');
  useActiveWorkoutStore.getState().setSetRir(0, finalQualifyingSet(0).id, 1);

  const body = buildCompleteWorkoutRequestBody(workout());
  const serialized = JSON.stringify(body);

  assertEqual(
    Object.keys(body).sort(),
    ['exercises', 'isLightSession', 'readiness', 'sessionId'],
    'The request has exactly four top-level keys',
  );
  for (const key of ['phase', 'phaseAtSession', 'phase_at_session', 'training_phase', 'trainingPhase']) {
    assert(!allKeys(body).has(key), `No "${key}" key appears anywhere in the request, at any depth`);
  }
  assert(!/phase/i.test(serialized), 'The serialized body does not mention a phase at all');

  // What the route does with it: the phase comes from the authenticated user
  // row, and the readiness from this body.
  const patch = buildSessionCompletionPatch({
    completedAt: '2026-08-07T10:00:00.000Z',
    durationSeconds: 3600,
    isLightSession: body.isLightSession,
    readiness: body.readiness,
    phaseAtSession: 'cut',  // read server-side from users.training_phase
  });
  assertEqual(patch.readiness, 'low', 'The readiness the lifter chose is stamped on the session');
  assertEqual(patch.phase_at_session, 'cut', 'The phase snapshot is the server\'s, and it is the only source');

  console.log('  ✓ four top-level keys, no phase at any depth, server phase stamped');
}

// ── P6: a partly-finished workout is still sendable ──────────────────────────
function testOpenSetsAndUncompletedWorkStillSend() {
  console.log('\nP6: open sets keep their place, and an uncompleted final set carries no RIR');

  hydrate();
  // Only the first working set is performed; the workout is abandoned early.
  const first = sets(0).find((set) => set.setType === 'working');
  if (!first) throw new Error('fixture has no working set');
  useActiveWorkoutStore.getState().updateSet(0, first.id, { values: { weight: 80, reps: 3 } });
  useActiveWorkoutStore.getState().completeSet(0, first.id);

  const body = buildCompleteWorkoutRequestBody(workout());

  assertEqual(
    body.exercises[0].sets.map((set) => set.isCompleted),
    [false, true, false, false, false],
    'Open sets are sent as open — the completion route keeps them with the workout',
  );
  assertEqual(
    body.exercises[0].sets.map((set) => set.rir),
    [null, null, null, null, null],
    'The final working set was never completed, so nothing could be rated and nothing is sent',
  );
  assertEqual(
    body.exercises[0].sets.map((set) => set.loggedAt !== null),
    [false, true, false, false, false],
    'Only the completed set carries a loggedAt',
  );
  assert(CompleteWorkoutRequestSchema.safeParse(body).success, 'A partly-finished workout is still a valid request');

  console.log('  ✓ open sets sent as open, no RIR on an uncompleted set, still schema-valid');
}

function main() {
  testZeroContextPathCompletes();
  testReadinessReachesTheRequest();
  testOnlyTheFinalWorkingSetCarriesRir();
  testRirEncodingSurvivesTheRequest();
  testNoPhaseIsEverSent();
  testOpenSetsAndUncompletedWorkStillSend();

  console.log('\n✅ All completion payload (Cycle 3) tests passed!');
  console.log('Coverage verified:');
  console.log('  ✓ The zero-context path sends readiness null and an explicit null rir on every set');
  console.log('  ✓ Each readiness level reaches the request; Skip sends null and no UI state');
  console.log('  ✓ Only the final completed working set carries RIR; keys stay uniform for the bulk upsert');
  console.log('  ✓ 0 / 1 / 2 / 3 survive the released request schema; Clear is null, never 0');
  console.log('  ✓ No phase field is sent at any depth — the snapshot stays server-derived');
  console.log('  ✓ A partly-finished workout still produces a valid request with no RIR');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
