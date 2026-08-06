/**
 * Cycle 2 — RED — Workout completion orchestration (ownership, order, phase trust)
 *
 * Run with: npx tsx src/lib/workout/__tests__/completion-route-persistence.spec.ts
 *
 * Plan: .hermes/plans/2026-08-06-cut-aware-progression-v1.md §4 (the phase
 * snapshot is server-derived), §10.1 (API), §15 Step 9, §18.7 (backwards
 * compatibility).
 *
 * `app/api/workouts/complete/route.ts` already performs this sequence, but it
 * does so inline against a live Supabase client, wrapped in a Next handler. The
 * ordering that makes the sequence correct is therefore untestable:
 *
 *   1. Every `sessionExerciseId` in the payload is checked against the session's
 *      own rows *before* a single write. Without it a caller could aim set rows
 *      at another session's exercises — RLS on `set_entries` is inherited
 *      through `session_exercises`, so the payload is the only place this can be
 *      caught.
 *   2. Sets are written first, then the post-save context/summary is derived
 *      from what is now in the database, and only then is the session marked
 *      complete. Loading the summary before the sets land would stamp
 *      `duration_seconds` and the totals off stale rows; completing the session
 *      before the sets land would leave a finished workout with missing sets.
 *   3. The phase snapshot is whatever the *server* read from `users`, never
 *      anything the client sent. A client that could name its own
 *      `phase_at_session` could relabel its history and move its own thresholds.
 *
 * Wished-for API — a pure, injectable core the existing POST route can call
 * without changing anything it returns:
 *
 *   persistWorkoutCompletion(deps, input): Promise<{ context, patch }>
 *
 * `deps` is three callbacks plus one pure selector; the route supplies the
 * Supabase-backed versions, this suite supplies four-line fakes. No Supabase, no
 * request handler, no network, no mocking framework.
 */

import { CompleteWorkoutRequestSchema } from '@/lib/validation';
import {
  persistWorkoutCompletion,
  type SetEntryUpsertInput,
  type SetEntryUpsertRow,
  type SessionCompletionPatch,
} from '../complete-workout-persistence';

// ── Assertion helpers (same plain style as persistence-contract.spec.ts) ──────

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

/** Run `run`, expecting it to reject, and hand the reason back for inspection. */
async function captureRejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Assertion failed: expected the call to reject, but it resolved');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── A tiny recording stand-in for the three persistence steps ─────────────────

/**
 * Whatever the route derives after the sets have landed. The core must treat it
 * as opaque and hand it straight back, so the route's summary, PR detection and
 * suggestion writes keep working untouched.
 */
interface PostSaveContext {
  exercisesAfterSave: Array<{ exercise_id: string; completed_sets: number }>;
  summary: { exercise_count: number; total_sets: number; total_volume_kg: number; duration_seconds: number };
}

interface FakeDeps {
  trace: string[];
  savedBatches: SetEntryUpsertRow[][];
  patches: SessionCompletionPatch[];
  context: PostSaveContext;
  saveSetEntries(rows: SetEntryUpsertRow[]): Promise<void>;
  /**
   * The completion stamp, read by the orchestration rather than handed to it —
   * see O9. Deliberately untraced here and deliberately equal to
   * `BASE_INPUT.completedAt`, so the tests either side of O9 assert the same
   * thing about `completed_at` whichever source the orchestration uses.
   */
  now(): string;
  /**
   * Optional parameter: today the orchestration calls this with no argument,
   * and O9 requires it to be called with the stamp. Both satisfy this shape.
   */
  loadPostSaveContext(completedAt?: string): Promise<PostSaveContext>;
  durationSeconds(context: PostSaveContext): number;
  completeSession(patch: SessionCompletionPatch): Promise<void>;
}

function createFakeDeps(
  failures: { setsError?: string; loadError?: string; sessionError?: string } = {},
): FakeDeps {
  const trace: string[] = [];
  const savedBatches: SetEntryUpsertRow[][] = [];
  const patches: SessionCompletionPatch[] = [];

  const context: PostSaveContext = {
    exercisesAfterSave: [
      { exercise_id: 'ex-bench', completed_sets: 2 },
      { exercise_id: 'ex-row', completed_sets: 1 },
    ],
    summary: { exercise_count: 2, total_sets: 3, total_volume_kg: 2870, duration_seconds: 3720 },
  };

  return {
    trace,
    savedBatches,
    patches,
    context,
    async saveSetEntries(rows: SetEntryUpsertRow[]) {
      trace.push('saveSetEntries');
      savedBatches.push(rows);
      if (failures.setsError) throw new Error(failures.setsError);
    },
    now() {
      return COMPLETED_AT;
    },
    async loadPostSaveContext() {
      trace.push('loadPostSaveContext');
      if (failures.loadError) throw new Error(failures.loadError);
      return context;
    },
    durationSeconds(loaded: PostSaveContext) {
      return loaded.summary.duration_seconds;
    },
    async completeSession(patch: SessionCompletionPatch) {
      trace.push('completeSession');
      patches.push(patch);
      if (failures.sessionError) throw new Error(failures.sessionError);
    },
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OWNED_A = '22222222-2222-4222-8222-222222222222';
const OWNED_B = '33333333-3333-4333-8333-333333333333';
/** Belongs to a different session — and, in the interesting case, another user. */
const FOREIGN = '44444444-4444-4444-8444-444444444444';

const PAYLOAD_EXERCISES: SetEntryUpsertInput[] = [
  {
    sessionExerciseId: OWNED_A,
    sets: [
      { setIndex: 0, values: { weight: 100, reps: 10 }, setType: 'working', isCompleted: true },
      { setIndex: 1, values: { weight: 100, reps: 9 }, setType: 'working', isCompleted: true, rir: 1 },
    ],
  },
  {
    sessionExerciseId: OWNED_B,
    sets: [
      { setIndex: 0, values: { weight: 60, reps: 12 }, setType: 'working', isCompleted: true, rir: 3 },
    ],
  },
];

/** The instant the session is stamped with. One value, whichever end supplies it. */
const COMPLETED_AT = '2026-08-06T10:30:00.000Z';

const BASE_INPUT = {
  exercises: PAYLOAD_EXERCISES,
  ownedSessionExerciseIds: [OWNED_A, OWNED_B],
  completedAt: COMPLETED_AT,
  isLightSession: false,
};

console.log('Running Workout completion orchestration (Cycle 2) tests...\n');

// ── O1: ownership is checked before anything is written ──────────────────────
async function testForeignSessionExerciseIsRejectedFirst() {
  console.log('O1: a session_exercise the session does not own fails before any write');

  const deps = createFakeDeps();
  const error = await captureRejection(() =>
    persistWorkoutCompletion(deps, {
      ...BASE_INPUT,
      exercises: [
        ...PAYLOAD_EXERCISES,
        {
          sessionExerciseId: FOREIGN,
          sets: [{ setIndex: 0, values: { weight: 200, reps: 5 }, setType: 'working', isCompleted: true }],
        },
      ],
    }),
  );

  assert(
    /does not belong/i.test(messageOf(error)),
    'The rejection names the ownership violation, so the route keeps returning its existing 500 for it',
  );
  assertEqual(
    deps.trace,
    [],
    'Not one callback ran — the check precedes the set write, the summary load and the completion',
  );
  assertEqual(deps.savedBatches.length, 0, 'No set_entries row is written against a foreign session_exercise');
  assertEqual(deps.patches.length, 0, 'The session is not completed by a payload that failed validation');

  // The rejection must not depend on the foreign id arriving last, or on the
  // owned ones being present at all.
  const firstPositionDeps = createFakeDeps();
  await captureRejection(() =>
    persistWorkoutCompletion(firstPositionDeps, {
      ...BASE_INPUT,
      exercises: [
        {
          sessionExerciseId: FOREIGN,
          sets: [{ setIndex: 0, values: { weight: 200, reps: 5 }, setType: 'working', isCompleted: true }],
        },
        ...PAYLOAD_EXERCISES,
      ],
    }),
  );
  assertEqual(
    firstPositionDeps.trace,
    [],
    'A foreign id in first position is caught before the owned rows in the same payload are written',
  );

  // Every id owned → no rejection. The guard rejects foreign ids, not payloads.
  const okDeps = createFakeDeps();
  const okResult = await persistWorkoutCompletion(okDeps, BASE_INPUT);
  assert(okResult !== null && okResult !== undefined, 'A fully owned payload completes normally');

  console.log('  ✓ foreign id → rejection, zero callbacks, in either payload position');
}

// ── O2: the three steps run in exactly one order ─────────────────────────────
async function testCallbackOrder() {
  console.log('\nO2: sets are written, then the post-save context is read, then the session completes');

  const deps = createFakeDeps();
  await persistWorkoutCompletion(deps, BASE_INPUT);

  assertEqual(
    deps.trace,
    ['saveSetEntries', 'loadPostSaveContext', 'completeSession'],
    'Reading the summary before the sets land would total stale rows; completing first would finish a workout with missing sets',
  );

  assertEqual(deps.savedBatches.length, 1, 'The sets are written in a single batch, as today');
  const rows = deps.savedBatches[0];
  assertEqual(rows.length, 3, 'One row per payload set, flattened across exercises');
  assertEqual(rows[0].session_exercise_id, OWNED_A, 'Rows carry their owning session_exercise_id');
  assertEqual(rows[0].rir, null, 'A set logged without RIR still persists NULL through the orchestration');
  assertEqual(rows[1].rir, 1, 'RIR 1 reaches the write unchanged');
  assertEqual(rows[2].rir, 3, 'RIR 3 reaches the write unchanged');

  console.log('  ✓ saveSetEntries → loadPostSaveContext → completeSession, one batch of 3 rows');
}

// ── O3: an empty payload still completes the session ─────────────────────────
async function testEmptyPayloadStillCompletes() {
  console.log('\nO3: a payload with no sets skips the write but still finishes the workout');

  const deps = createFakeDeps();
  await persistWorkoutCompletion(deps, {
    ...BASE_INPUT,
    exercises: [{ sessionExerciseId: OWNED_A, sets: [] }],
  });

  assertEqual(
    deps.trace,
    ['loadPostSaveContext', 'completeSession'],
    'An empty upsert is not issued — today\'s route guards on setsToSave.length, and finishing must still work',
  );
  assertEqual(deps.patches.length, 1, 'The session is completed even when the payload carried nothing new');

  console.log('  ✓ no set write, session still completed');
}

// ── O4: the patch carries the server\'s phase and the payload\'s readiness ────
async function testPatchContents() {
  console.log('\nO4: the completion patch takes phase from the server and readiness from the payload');

  const deps = createFakeDeps();
  await persistWorkoutCompletion(deps, {
    ...BASE_INPUT,
    readiness: 'low',
    phaseAtSession: 'cut',
  });

  const [patch] = deps.patches;
  assertEqual(
    Object.keys(patch).sort(),
    ['completed_at', 'duration_seconds', 'is_light_session', 'phase_at_session', 'readiness'],
    'The patch is the three existing completion fields plus two nullable context columns',
  );
  assertEqual(patch.completed_at, '2026-08-06T10:30:00.000Z', 'completed_at is the caller\'s stamp, verbatim');
  assertEqual(
    patch.duration_seconds,
    3720,
    'duration_seconds comes from the post-save context — derived after the sets landed, not before',
  );
  assertEqual(patch.is_light_session, false, 'The Light/off-day flag is passed through untouched');
  assertEqual(patch.readiness, 'low', 'The readiness the user picked is stamped on the session');
  assertEqual(patch.phase_at_session, 'cut', 'The phase the server read from users is snapshotted (§4)');

  console.log('  ✓ completed_at, duration from the loader, is_light_session, readiness low, phase cut');
}

// ── O5: absent context degrades to null, never to a guess ────────────────────
async function testAbsentContextBecomesNull() {
  console.log('\nO5: an omitted readiness and an unreadable phase both write NULL');

  // A pre-Cycle-2 client: no readiness key at all.
  const legacyDeps = createFakeDeps();
  await persistWorkoutCompletion(legacyDeps, { ...BASE_INPUT, phaseAtSession: 'build' });
  assertEqual(
    legacyDeps.patches[0].readiness,
    null,
    'A payload that predates readiness completes with NULL — "never asked", not a fabricated level',
  );
  assertEqual(legacyDeps.patches[0].phase_at_session, 'build', 'The server phase still lands for an old client');

  // A failed or empty `users` read leaves the route with null. The column's
  // `build` default is the database's to apply on insert, never this path's to
  // guess on update — a cutting lifter must not be relabelled Build by one
  // flaky query.
  const unreadableDeps = createFakeDeps();
  await persistWorkoutCompletion(unreadableDeps, {
    ...BASE_INPUT,
    readiness: null,
    phaseAtSession: null,
  });
  assertEqual(unreadableDeps.patches[0].phase_at_session, null, 'An unread phase writes NULL, never build');
  assertEqual(unreadableDeps.patches[0].readiness, null, 'An explicit null readiness stays null');

  // Junk on either field costs the signal, never the workout.
  const junkDeps = createFakeDeps();
  await persistWorkoutCompletion(junkDeps, {
    ...BASE_INPUT,
    readiness: 'exhausted',
    phaseAtSession: 'bulk',
  });
  assertEqual(junkDeps.patches[0].readiness, null, 'An unrecognised readiness never reaches chk_session_readiness');
  assertEqual(junkDeps.patches[0].phase_at_session, null, 'An unrecognised phase never reaches chk_session_phase');
  assertEqual(
    junkDeps.trace,
    ['saveSetEntries', 'loadPostSaveContext', 'completeSession'],
    'Bad optional context never costs the user their sets',
  );

  console.log('  ✓ omitted / null / junk readiness and phase → null, and the workout still completes');
}

// ── O6: the client cannot name its own phase ─────────────────────────────────
async function testClientSuppliedPhaseCannotReachThePatch() {
  console.log('\nO6: a client-supplied phase is stripped at the schema and cannot reach the patch');

  const hostilePayload = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    isLightSession: false,
    readiness: 'high',
    // A client trying to relabel its own history: `cut` sessions read against
    // cut thresholds, so naming the phase would move the lifter's own targets.
    phaseAtSession: 'cut',
    trainingPhase: 'cut',
    phase_at_session: 'cut',
    exercises: [
      {
        sessionExerciseId: OWNED_A,
        sets: [{ setIndex: 0, values: { weight: 100, reps: 10 }, setType: 'working', isCompleted: true }],
      },
    ],
  };

  const parsed = CompleteWorkoutRequestSchema.parse(hostilePayload);
  assert(!('phaseAtSession' in parsed), 'phaseAtSession is not a field of the request schema — it is stripped');
  assert(!('trainingPhase' in parsed), 'trainingPhase is not a field of the request schema — it is stripped');
  assert(!('phase_at_session' in parsed), 'The snake_case spelling is stripped too');
  assertEqual(parsed.readiness, 'high', 'The fields the client *is* allowed to send survive');

  // The route derives the phase from `users` and passes that. Whatever the
  // client sent is not even in scope by this point.
  const deps = createFakeDeps();
  await persistWorkoutCompletion(deps, {
    ...BASE_INPUT,
    exercises: parsed.exercises as SetEntryUpsertInput[],
    readiness: parsed.readiness,
    phaseAtSession: 'build',
  });

  assertEqual(
    deps.patches[0].phase_at_session,
    'build',
    'The stored phase wins: the snapshot is server-derived, never client-trusted (§4)',
  );
  assertEqual(deps.patches[0].readiness, 'high', 'The client\'s readiness — an opinion it is entitled to — still lands');

  console.log('  ✓ schema strips phaseAtSession / trainingPhase / phase_at_session; the patch says build');
}

// ── O7: a failed step stops the ones after it ────────────────────────────────
async function testFailurePropagation() {
  console.log('\nO7: a failed set write stops the summary and the completion; a failed load stops the completion');

  const setsFailed = createFakeDeps({ setsError: 'set_entries upsert failed' });
  const setsError = await captureRejection(() => persistWorkoutCompletion(setsFailed, BASE_INPUT));
  assertEqual(messageOf(setsError), 'set_entries upsert failed', 'The underlying failure surfaces to the route unchanged');
  assertEqual(
    setsFailed.trace,
    ['saveSetEntries'],
    'A workout whose sets did not land is never summarised and never marked complete',
  );
  assertEqual(setsFailed.patches.length, 0, 'No completion patch is issued after a failed set write');

  const loadFailed = createFakeDeps({ loadError: 'post-save context load failed' });
  const loadError = await captureRejection(() => persistWorkoutCompletion(loadFailed, BASE_INPUT));
  assertEqual(messageOf(loadError), 'post-save context load failed', 'The loader\'s failure surfaces unchanged');
  assertEqual(
    loadFailed.trace,
    ['saveSetEntries', 'loadPostSaveContext'],
    'Without a summary there is no duration_seconds — completing anyway would stamp a guessed one',
  );
  assertEqual(loadFailed.patches.length, 0, 'The session stays open rather than being completed with an invented duration');

  // The completion write itself failing is still the route's error to handle.
  const sessionFailed = createFakeDeps({ sessionError: 'workout_sessions update failed' });
  const sessionError = await captureRejection(() => persistWorkoutCompletion(sessionFailed, BASE_INPUT));
  assertEqual(messageOf(sessionError), 'workout_sessions update failed', 'A failed completion write propagates');
  assertEqual(
    sessionFailed.trace,
    ['saveSetEntries', 'loadPostSaveContext', 'completeSession'],
    'All three steps were attempted before the failure',
  );

  console.log('  ✓ sets fail → 1 step; load fails → 2 steps, no patch; completion fails → propagates');
}

// ── O8: the loaded context is handed back untouched ──────────────────────────
async function testReturnedContextIsTheLoadersValue() {
  console.log('\nO8: the post-save context is returned exactly as the loader produced it');

  const deps = createFakeDeps();
  const result = await persistWorkoutCompletion(deps, {
    ...BASE_INPUT,
    readiness: 'normal',
    phaseAtSession: 'maintain',
  });

  assert(
    result.context === deps.context,
    'The identical object is returned — the route\'s PR detection, snapshots and suggestions keep reading what they read today',
  );
  assertEqual(
    result.context.summary,
    { exercise_count: 2, total_sets: 3, total_volume_kg: 2870, duration_seconds: 3720 },
    'The summary is not re-derived, re-rounded or reshaped by the orchestration',
  );
  assertEqual(
    result.context.exercisesAfterSave.map((exercise) => exercise.exercise_id),
    ['ex-bench', 'ex-row'],
    'The loader\'s ordering survives — the response\'s exerciseNames depend on it',
  );
  assertEqual(
    result.patch,
    deps.patches[0],
    'The patch that was written is the patch that is returned — one source of truth for what the session now says',
  );

  console.log('  ✓ context is the loader\'s own object; patch matches what was written');
}

// ── O9: the completion stamp is taken after the sets land ────────────────────
/**
 * The legacy route read its clock *between* the two:
 *
 *   upsert set_entries
 *   const completedAt = new Date().toISOString()      // ← here
 *   loadSessionContext() → buildSummary(started_at, exercises, completedAt)
 *   update workout_sessions { completed_at, duration_seconds, … }
 *
 * So `completed_at` included however long the upsert took, and
 * `duration_seconds` was measured to that same instant. A stamp taken before
 * the upsert — as it is now, computed by the caller and handed in — reports a
 * workout that ended before its last set was saved, and shortens every recorded
 * session by the write's latency.
 *
 * That is observable without reading any source: the clock is a dependency, its
 * call lands on the same trace as the writes, and the loader is handed the
 * value it must summarise against.
 */
interface ClockTracedDeps {
  trace: string[];
  loaderArgs: Array<string | undefined>;
  patches: SessionCompletionPatch[];
  context: PostSaveContext;
  nowCalls: number;
  saveSetEntries(rows: SetEntryUpsertRow[]): Promise<void>;
  now(): string;
  loadPostSaveContext(completedAt?: string): Promise<PostSaveContext>;
  durationSeconds(context: PostSaveContext): number;
  completeSession(patch: SessionCompletionPatch): Promise<void>;
}

/** A clock that reads later than the caller's own stamp, so the two are telling apart. */
const CAPTURED_AFTER_SETS = '2026-08-06T10:31:07.000Z';

function createClockTracedDeps(): ClockTracedDeps {
  const deps: ClockTracedDeps = {
    trace: [],
    loaderArgs: [],
    patches: [],
    nowCalls: 0,
    context: {
      exercisesAfterSave: [{ exercise_id: 'ex-bench', completed_sets: 2 }],
      summary: { exercise_count: 1, total_sets: 2, total_volume_kg: 1900, duration_seconds: 3787 },
    },
    async saveSetEntries(rows: SetEntryUpsertRow[]) {
      deps.trace.push('saveSetEntries');
      void rows;
    },
    now() {
      deps.trace.push('now');
      deps.nowCalls += 1;
      return CAPTURED_AFTER_SETS;
    },
    async loadPostSaveContext(completedAt?: string) {
      deps.trace.push('loadPostSaveContext');
      deps.loaderArgs.push(completedAt);
      return deps.context;
    },
    durationSeconds(loaded: PostSaveContext) {
      return loaded.summary.duration_seconds;
    },
    async completeSession(patch: SessionCompletionPatch) {
      deps.trace.push('completeSession');
      deps.patches.push(patch);
    },
  };
  return deps;
}

async function testCompletedAtIsStampedAfterTheSetsLand() {
  console.log('\nO9: completed_at is read after the sets land, and the summary is measured to that same instant');

  const deps = createClockTracedDeps();
  // `BASE_INPUT.completedAt` is the stamp the caller computed before dispatch.
  // It must lose: the workout had not finished being saved when it was taken.
  await persistWorkoutCompletion(deps, BASE_INPUT);

  assertEqual(
    deps.trace,
    ['saveSetEntries', 'now', 'loadPostSaveContext', 'completeSession'],
    'The clock is read once the sets have landed and before the summary is derived — exactly where the route read it',
  );
  assertEqual(deps.nowCalls, 1, 'One reading, so completed_at and the summary cannot disagree about when the workout ended');
  assertEqual(
    deps.patches[0].completed_at,
    CAPTURED_AFTER_SETS,
    'The session is stamped with the instant the sets finished saving, not one taken before the write was issued',
  );
  assertEqual(
    deps.loaderArgs,
    [CAPTURED_AFTER_SETS],
    'The loader summarises against that same instant — duration_seconds is measured to the stamp that is written',
  );
  assertEqual(
    deps.patches[0].duration_seconds,
    3787,
    'And the duration is still whatever the loader\'s summary said, passed through untouched',
  );

  // An empty payload skips the upsert; the stamp still precedes the summary.
  const empty = createClockTracedDeps();
  await persistWorkoutCompletion(empty, {
    ...BASE_INPUT,
    exercises: [{ sessionExerciseId: OWNED_A, sets: [] }],
  });
  assertEqual(
    empty.trace,
    ['now', 'loadPostSaveContext', 'completeSession'],
    'With nothing to upsert the order is unchanged — the clock still leads the summary',
  );
  assertEqual(empty.patches[0].completed_at, CAPTURED_AFTER_SETS, 'And the stamp is still the captured one');

  // A payload that fails ownership never reaches the clock at all.
  const foreign = createClockTracedDeps();
  await captureRejection(() =>
    persistWorkoutCompletion(foreign, {
      ...BASE_INPUT,
      exercises: [
        ...PAYLOAD_EXERCISES,
        {
          sessionExerciseId: FOREIGN,
          sets: [{ setIndex: 0, values: { weight: 200, reps: 5 }, setType: 'working', isCompleted: true }],
        },
      ],
    }),
  );
  assertEqual(foreign.trace, [], 'A rejected payload stamps nothing — the ownership check still precedes everything');
  assertEqual(foreign.nowCalls, 0, 'Including the clock');

  console.log('  ✓ saveSetEntries → now → loadPostSaveContext → completeSession, one reading, loader given the stamp');
}

async function main() {
  await testForeignSessionExerciseIsRejectedFirst();
  await testCallbackOrder();
  await testEmptyPayloadStillCompletes();
  await testPatchContents();
  await testAbsentContextBecomesNull();
  await testClientSuppliedPhaseCannotReachThePatch();
  await testFailurePropagation();
  await testReturnedContextIsTheLoadersValue();
  await testCompletedAtIsStampedAfterTheSetsLand();

  console.log('\n✅ All Workout completion orchestration (Cycle 2) tests passed!');
  console.log('Coverage verified:');
  console.log('  ✓ A session_exercise the session does not own fails before any callback runs');
  console.log('  ✓ Sets are written, then the summary is derived, then the session is completed');
  console.log('  ✓ duration_seconds comes from the post-save context, never from a pre-save read');
  console.log('  ✓ phase_at_session is the server\'s value; the client cannot send one');
  console.log('  ✓ Omitted, null and junk readiness/phase all write NULL without losing the workout');
  console.log('  ✓ A failed set write stops the summary and the completion');
  console.log('  ✓ A failed summary load stops the completion');
  console.log('  ✓ The loader\'s context is returned by identity, so downstream behaviour is unchanged');
  console.log('  ✓ completed_at is read after the sets land and handed to the summary — the legacy route\'s timing');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
