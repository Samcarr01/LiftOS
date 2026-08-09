/**
 * Cycle 1 — Data safety — RED — Discard Workout is not allowed to lose a workout
 *
 * Run with: npx tsx src/lib/workout/__tests__/discard-workout.spec.ts
 *
 * Contract (approved, part 2):
 *   Discard Workout must only clear local state and navigate home after the
 *   server delete succeeds. If the delete returns an error or throws, retain
 *   the workout, keep the dialog open, and surface an error. The destructive
 *   button must be in-flight guarded.
 *
 * What is wrong today
 * -------------------
 * Both discard paths — the Leave dialog in src/app/workout/[id]/page.tsx and
 * the resume banner in src/app/(app)/page.tsx — do this:
 *
 *   await supabase.from('workout_sessions').delete().eq('id', session.id);
 *   clearWorkout();
 *   router.replace('/');
 *
 * `supabase.delete()` resolves with `{ error }` rather than rejecting, so an
 * RLS denial, an offline device or a 500 all take the happy path. The local
 * workout — the only copy of every set logged since the last successful sync —
 * is wiped, the user is sent home, and the session is still on the server. The
 * lifter is told nothing. That is unrecoverable data loss from a button that
 * was supposed to delete a row.
 *
 * The workout-page path has no in-flight guard at all, so a double tap fires
 * two deletes and two navigations.
 *
 * The wished-for surface
 * ----------------------
 * These handlers are inline JSX closures, which is exactly why they were never
 * covered. This suite pins the decision as a plain, injectable unit that both
 * call sites can share and a React hook can wrap:
 *
 *   // @/lib/workout/discard-workout
 *   createWorkoutDiscarder(deps: {
 *     sessionId:     string;
 *     deleteSession: (sessionId: string) => Promise<{ error?: unknown } | void>;
 *     clearWorkout:  () => void;
 *     navigateHome:  () => void;
 *     onError:       (message: string) => void;
 *   }): {
 *     isPending(): boolean;
 *     discard():   Promise<{ discarded: boolean; error: string | null }>;
 *   }
 *
 * `discarded` is the caller's cue: true closes the dialog, false leaves it
 * open with the workout still in the store. The guard lives in the discarder
 * rather than in `useState` on purpose — React state lags a double tap, so the
 * thing that must not fire twice is the one that owns the latch.
 *
 * `discard()` must never reject. It is wired straight to onClick; an unhandled
 * rejection there is a silent no-op with a dialog left mid-action.
 *
 * No Supabase, no network, no JSX — hand-rolled dependency doubles only.
 */

// ── Assertion helpers (same plain style as the sibling suites) ────────────────

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

// ── The wished-for module ────────────────────────────────────────────────────

type DiscardResult = { discarded: boolean; error: string | null };

interface WorkoutDiscarder {
  isPending(): boolean;
  discard(): Promise<DiscardResult>;
}

type DiscardDeps = {
  sessionId: string;
  deleteSession: (sessionId: string) => Promise<{ error?: unknown } | void>;
  clearWorkout: () => void;
  navigateHome: () => void;
  onError: (message: string) => void;
};

type CreateWorkoutDiscarder = (deps: DiscardDeps) => WorkoutDiscarder;

/**
 * Resolved once, through a dynamic import, so a missing module fails as a
 * readable assertion about the contract rather than as a module-resolution
 * stack trace before a single case has run.
 */
async function loadCreateWorkoutDiscarder(): Promise<CreateWorkoutDiscarder> {
  let loaded: Record<string, unknown>;
  try {
    loaded = (await import('@/lib/workout/discard-workout')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      'Assertion failed: @/lib/workout/discard-workout must exist — the discard decision has to live somewhere ' +
        'both call sites (workout/[id]/page.tsx and (app)/page.tsx) can share and a test can reach, ' +
        `not inside two inline onClick closures.\n  Import failed: ${(err as Error).message}`,
    );
  }

  const factory = loaded.createWorkoutDiscarder;
  assert(
    typeof factory === 'function',
    'The module exports createWorkoutDiscarder(deps) — a discarder that owns the in-flight latch and the ' +
      'clear/navigate decision, so neither depends on a React re-render',
  );
  return factory as CreateWorkoutDiscarder;
}

// ── Recording doubles ────────────────────────────────────────────────────────

interface Recorder {
  deleteCalls: string[];
  cleared: number;
  navigated: number;
  errors: string[];
  deps: DiscardDeps;
}

/** A discarder wired to counters, with the server delete supplied per case. */
function recorder(deleteSession: DiscardDeps['deleteSession']): Recorder {
  const rec: Recorder = {
    deleteCalls: [],
    cleared: 0,
    navigated: 0,
    errors: [],
    deps: null as unknown as DiscardDeps,
  };
  rec.deps = {
    sessionId: 'ws_discard',
    deleteSession: (sessionId) => {
      rec.deleteCalls.push(sessionId);
      return deleteSession(sessionId);
    },
    clearWorkout: () => { rec.cleared += 1; },
    navigateHome: () => { rec.navigated += 1; },
    onError: (message) => { rec.errors.push(message); },
  };
  return rec;
}

/** A promise the test resolves by hand, to inspect the in-flight moment. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Let every already-scheduled microtask run. */
function flush(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0));
}

async function main() {
  const createWorkoutDiscarder = await loadCreateWorkoutDiscarder();

  console.log('Running Discard workout safety (Cycle 1 data safety) tests...\n');

  // ── D1: a returned error retains everything ────────────────────────────────
  {
    console.log('D1: a delete that resolves with an error keeps the workout and reports it');

    const rec = recorder(async () => ({ error: { message: 'permission denied for table workout_sessions' } }));
    const discarder = createWorkoutDiscarder(rec.deps);

    const result = await discarder.discard();

    assertEqual(rec.deleteCalls, ['ws_discard'], 'The delete was attempted once, for this session');
    assertEqual(
      rec.cleared,
      0,
      'The local workout is retained — supabase.delete() resolves with { error } instead of rejecting, and ' +
        'clearing on that path destroys the only copy of every set logged since the last sync',
    );
    assertEqual(rec.navigated, 0, 'The user is not sent home from a delete that did not happen');
    assertEqual(rec.errors.length, 1, 'The failure is surfaced exactly once');
    assert(rec.errors[0].trim().length > 0, 'The surfaced error carries a non-empty message');
    assertEqual(result.discarded, false, 'discarded is false, so the caller keeps the dialog open');
    assert(result.error !== null, 'The result carries the failure alongside discarded: false');

    console.log('  ✓ workout retained, no navigation, one error surfaced');
  }

  // ── D2: a thrown error is the same story ───────────────────────────────────
  {
    console.log('D2: a delete that throws is treated exactly like one that returns an error');

    const rec = recorder(async () => { throw new Error('Failed to fetch'); });
    const discarder = createWorkoutDiscarder(rec.deps);

    let rejected = false;
    const result = await discarder.discard().catch(() => { rejected = true; return null; });

    assert(!rejected, 'discard() never rejects — it is wired to onClick, where a rejection is a silent dead end');
    assertEqual(rec.cleared, 0, 'An offline or crashed delete retains the workout');
    assertEqual(rec.navigated, 0, 'An offline or crashed delete does not navigate');
    assertEqual(rec.errors.length, 1, 'The thrown failure is surfaced too');
    assertEqual(result!.discarded, false, 'discarded is false for a thrown failure');

    console.log('  ✓ throw is caught, workout retained, error surfaced');
  }

  // ── D3: success clears and navigates, and only then ────────────────────────
  {
    console.log('D3: a successful delete clears and navigates — and not before it resolves');

    const gate = deferred<{ error?: unknown }>();
    const rec = recorder(() => gate.promise);
    const discarder = createWorkoutDiscarder(rec.deps);

    const running = discarder.discard();
    await flush();

    assertEqual(rec.deleteCalls, ['ws_discard'], 'The delete is in flight');
    assertEqual(
      rec.cleared,
      0,
      'Nothing is cleared while the delete is still in flight — the workout survives a delete that never lands',
    );
    assertEqual(rec.navigated, 0, 'No navigation while the delete is still in flight');

    gate.resolve({ error: null });
    const result = await running;

    assertEqual(rec.cleared, 1, 'The local workout is cleared once the server row is really gone');
    assertEqual(rec.navigated, 1, 'The user goes home once, after the delete succeeded');
    assertEqual(rec.errors, [], 'A successful discard surfaces no error');
    assertEqual(result.discarded, true, 'Success reports discarded: true');
    assertEqual(result.error, null, 'Success carries no error');

    console.log('  ✓ clear and navigate happen once, strictly after success');
  }

  // ── D4: the destructive action is in-flight guarded ────────────────────────
  {
    console.log('D4: a second tap while a discard is in flight does not fire a second delete');

    const gate = deferred<{ error?: unknown }>();
    const rec = recorder(() => gate.promise);
    const discarder = createWorkoutDiscarder(rec.deps);

    const first = discarder.discard();
    await flush();

    assert(
      discarder.isPending(),
      'isPending() is true while the delete is in flight — the button needs something to disable on that ' +
        'does not depend on a React re-render landing between two taps',
    );

    const second = discarder.discard();
    const third = discarder.discard();
    await flush();

    assertEqual(
      rec.deleteCalls,
      ['ws_discard'],
      'Three taps, one delete — a destructive action must not be issued twice',
    );

    gate.resolve({ error: null });
    await Promise.all([first, second, third]);

    assertEqual(rec.cleared, 1, 'The workout is cleared once, not once per tap');
    assertEqual(rec.navigated, 1, 'The user is navigated home once, not once per tap');
    assert(!discarder.isPending(), 'isPending() is false again once the discard settles');

    console.log('  ✓ three taps, one delete, one clear, one navigation');
  }

  // ── D5: a failed discard can be retried ────────────────────────────────────
  {
    console.log('D5: the latch releases after a failure, so the retained workout can be discarded again');

    let attempt = 0;
    const rec = recorder(async () => {
      attempt += 1;
      return attempt === 1 ? { error: { message: 'network error' } } : { error: null };
    });
    const discarder = createWorkoutDiscarder(rec.deps);

    const failed = await discarder.discard();
    assertEqual(failed.discarded, false, 'The first attempt failed');
    assert(!discarder.isPending(), 'The latch releases after a failure — otherwise the button stays dead forever');
    assertEqual(rec.cleared, 0, 'Nothing was cleared by the failed attempt');

    const retried = await discarder.discard();
    assertEqual(retried.discarded, true, 'The retry succeeds');
    assertEqual(rec.deleteCalls.length, 2, 'The retry issued a second delete');
    assertEqual(rec.cleared, 1, 'The workout is cleared only by the attempt that actually succeeded');
    assertEqual(rec.navigated, 1, 'Navigation happens only on the successful attempt');
    assertEqual(rec.errors.length, 1, 'Only the failed attempt surfaced an error');

    console.log('  ✓ failure leaves the button usable; the retry is the one that clears');
  }

  console.log('\n✅ All Discard workout safety (Cycle 1 data safety) tests passed!');
  console.log('Coverage verified:');
  console.log('  ✓ A delete that resolves with an error retains the workout and surfaces the failure');
  console.log('  ✓ A delete that throws is handled identically, and discard() never rejects');
  console.log('  ✓ Clearing and navigation happen only after the delete really succeeded');
  console.log('  ✓ Three taps issue one delete, one clear and one navigation');
  console.log('  ✓ A failed discard releases the latch so it can be retried');
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}`);
  process.exit(1);
});
