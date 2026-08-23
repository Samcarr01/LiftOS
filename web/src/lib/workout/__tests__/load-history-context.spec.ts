/**
 * Cycle 2 — RED — T9: history plumbing (per-session context)
 *
 * Run with: npx tsx src/lib/workout/__tests__/load-history-context.spec.ts
 *
 * Plan: .hermes/plans/2026-08-06-cut-aware-progression-v1.md §1.2, §2.2, §10.1,
 * §13 (missing readiness/phase/RIR, light sessions), §15 Step 7, §18.2.
 *
 * `load-history.ts` is the single place raw rows become engine input, so it is
 * the single place per-session context should be attached. This file is written
 * BEFORE that module grows the wished-for API:
 *
 *   mapHistoryRows(rows): HistoryContextResult              — pure, no client
 *   loadHistorySessionsWithContext(fetchRows, exerciseId)   — one injectable seam
 *   loadHistorySessions(supabase, exerciseId)               — unchanged wrapper
 *
 * Two hard rules under test:
 *   1. The legacy `ProgressHistorySession[]` shape does not move a byte. Every
 *      existing caller (`use-start-workout`, the complete route, the 13-test
 *      Cycle 1 suite) keeps getting exactly what it gets today.
 *   2. Context binds by `sessionId`. Sessions are re-sorted newest-first, so any
 *      positional pairing would silently attribute one session's readiness to
 *      another's numbers — the worst possible failure for this feature.
 *
 * No network and no Supabase client: the loader's only dependency is a typed
 * row-fetcher function, faked here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  mapHistoryRows,
  mapHistoryRowsByExercise,
  loadHistorySessionsWithContext,
  loadHistorySessions,
  type HistoryRow,
  type HistoryContextResult,
  type HistoryRowFetcher,
} from '../load-history';
import type { ProgressHistorySession } from '../guided-progression';
import type { ObservationSession } from '../observation';
import type { SessionContext } from '../interpretation';

// ── Assertion helpers (same plain style as progression-cycle-1.spec.ts) ───────

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

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A row exactly as it looked before this cycle: no readiness, phase or rir. */
function legacyRow(sessionId: string, completedAt: string): HistoryRow {
  return {
    session_id: sessionId,
    exercise_id: 'ex-1',
    workout_sessions: { completed_at: completedAt, is_light_session: false },
    set_entries: [
      {
        set_index: 0,
        values: { weight: 100, reps: 10 },
        set_type: 'working',
        is_completed: true,
        logged_at: `${completedAt.slice(0, 10)}T09:00:00.000Z`,
      },
      {
        set_index: 1,
        values: { weight: 100, reps: 9 },
        set_type: 'working',
        is_completed: true,
        logged_at: `${completedAt.slice(0, 10)}T09:04:00.000Z`,
      },
    ],
  };
}

function findContext(contexts: SessionContext[], sessionId: string): SessionContext {
  const found = contexts.find((context) => context.sessionId === sessionId);
  if (!found) {
    throw new Error(`Assertion failed: no context for session ${sessionId}`);
  }
  return found;
}

console.log('Running History context (T9) tests...\n');

// ── T9.1: legacy rows map safely and keep the exact old output shape ─────────
{
  console.log('T9.1: rows with no context columns map without throwing, shape unchanged');

  const result: HistoryContextResult = mapHistoryRows([
    legacyRow('s-old', '2026-07-25T10:00:00.000Z'),
    legacyRow('s-new', '2026-08-01T10:00:00.000Z'),
  ]);

  // Key order follows today's mapper (load-history.ts) — this is a
  // byte-for-byte compatibility assertion, not a style preference.
  const expectedSessions: ProgressHistorySession[] = [
    {
      sessionId: 's-new',
      completedAt: '2026-08-01T10:00:00.000Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, logged_at: '2026-08-01T09:00:00.000Z' },
        { set_index: 1, values: { weight: 100, reps: 9 }, set_type: 'working', is_completed: true, logged_at: '2026-08-01T09:04:00.000Z' },
      ],
    },
    {
      sessionId: 's-old',
      completedAt: '2026-07-25T10:00:00.000Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, logged_at: '2026-07-25T09:00:00.000Z' },
        { set_index: 1, values: { weight: 100, reps: 9 }, set_type: 'working', is_completed: true, logged_at: '2026-07-25T09:04:00.000Z' },
      ],
    },
  ];

  assertEqual(
    result.sessions,
    expectedSessions,
    'The legacy ProgressHistorySession[] output is deep-equal to today\'s shape, newest-first',
  );

  assertEqual(
    result.contexts,
    [
      { sessionId: 's-new', readiness: null, phaseAtSession: null, isLightSession: false },
      { sessionId: 's-old', readiness: null, phaseAtSession: null, isLightSession: false },
    ],
    'Every historical session lands at readiness null / phase null — the compatibility hinge (§3, §18.2)',
  );

  assertEqual(
    result.observationSessions.map((session: ObservationSession) => session.sets.map((set) => set.rir ?? null)),
    [[null, null], [null, null]],
    'Legacy sets carry no RIR — absent, never 0',
  );

  console.log('  ✓ no throw; sessions byte-identical; contexts all-null');
}

// ── T9.2: readiness, phase and per-set RIR come through ──────────────────────
{
  console.log('\nT9.2: readiness, phase_at_session and final-set rir map through');

  const rows: HistoryRow[] = [
    {
      session_id: 's-cut',
      exercise_id: 'ex-1',
      workout_sessions: {
        completed_at: '2026-08-01T10:00:00.000Z',
        is_light_session: false,
        readiness: 'low',
        phase_at_session: 'cut',
      },
      set_entries: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, logged_at: null, rir: 2 },
        { set_index: 1, values: { weight: 100, reps: 8 }, set_type: 'working', is_completed: true, logged_at: null, rir: 0 },
      ],
    },
  ];

  const result = mapHistoryRows(rows);

  assertEqual(
    result.contexts[0],
    { sessionId: 's-cut', readiness: 'low', phaseAtSession: 'cut', isLightSession: false },
    'Session context is assembled from the joined workout_sessions row',
  );

  const [observed] = result.observationSessions;
  assertEqual(observed.sessionId, 's-cut', 'Observation input keeps the session identity');
  assertEqual(observed.completedAt, '2026-08-01T10:00:00.000Z', 'completedAt is carried for gap maths');
  assertEqual(observed.sets.map((set) => set.rir ?? null), [2, 0], 'Per-set RIR maps through, 0 included');

  // The raw record is untouched by the context that now travels beside it.
  assertEqual(
    result.sessions[0].sets.map((set) => set.values),
    [{ weight: 100, reps: 10 }, { weight: 100, reps: 8 }],
    'Recorded values are unchanged by the presence of readiness/phase',
  );
  assert(
    !('rir' in result.sessions[0].sets[0]),
    'The legacy sessions output gains no new keys — observationSessions is where rir lives',
  );

  console.log('  ✓ readiness low, phase cut, rir [2, 0]; raw values untouched');
}

// ── T9.3: contexts bind by sessionId, never by array position ────────────────
{
  console.log('\nT9.3: context binds by sessionId, surviving the newest-first re-sort');

  // Deliberately fed oldest-first, so output order != input order. A positional
  // pairing would hand the cut/very_low tag to the wrong session's numbers.
  const rows: HistoryRow[] = [
    {
      session_id: 's-oldest',
      exercise_id: 'ex-1',
      workout_sessions: {
        completed_at: '2026-07-20T10:00:00.000Z',
        is_light_session: false,
        readiness: 'high',
        phase_at_session: 'build',
      },
      set_entries: [
        { set_index: 0, values: { weight: 90, reps: 10 }, set_type: 'working', is_completed: true, logged_at: null, rir: 3 },
      ],
    },
    {
      session_id: 's-middle',
      exercise_id: 'ex-1',
      workout_sessions: {
        completed_at: '2026-07-27T10:00:00.000Z',
        is_light_session: false,
        readiness: 'normal',
        phase_at_session: 'maintain',
      },
      set_entries: [
        { set_index: 0, values: { weight: 95, reps: 10 }, set_type: 'working', is_completed: true, logged_at: null, rir: 1 },
      ],
    },
    {
      session_id: 's-newest',
      exercise_id: 'ex-1',
      workout_sessions: {
        completed_at: '2026-08-01T10:00:00.000Z',
        is_light_session: false,
        readiness: 'very_low',
        phase_at_session: 'cut',
      },
      set_entries: [
        { set_index: 0, values: { weight: 100, reps: 6 }, set_type: 'working', is_completed: true, logged_at: null, rir: 0 },
      ],
    },
  ];

  const result = mapHistoryRows(rows);

  assertEqual(
    result.sessions.map((session) => session.sessionId),
    ['s-newest', 's-middle', 's-oldest'],
    'Output is newest-first, reversing the input order',
  );
  assertEqual(
    result.contexts.map((context) => context.sessionId),
    ['s-newest', 's-middle', 's-oldest'],
    'Contexts are emitted in the same order as sessions and observationSessions',
  );
  assertEqual(
    result.observationSessions.map((session) => session.sessionId),
    ['s-newest', 's-middle', 's-oldest'],
    'observationSessions align index-for-index with contexts',
  );

  // The identity check that actually matters.
  assertEqual(findContext(result.contexts, 's-newest').readiness, 'very_low', 's-newest keeps its very_low tag');
  assertEqual(findContext(result.contexts, 's-middle').readiness, 'normal', 's-middle keeps its normal tag');
  assertEqual(findContext(result.contexts, 's-oldest').readiness, 'high', 's-oldest keeps its high tag');
  assertEqual(findContext(result.contexts, 's-newest').phaseAtSession, 'cut', 's-newest was logged during a cut');
  assertEqual(findContext(result.contexts, 's-oldest').phaseAtSession, 'build', 's-oldest was logged during a build');

  // Proof the pairing is not positional: input[0] is s-oldest/high, output[0] is not.
  assert(
    result.contexts[0].readiness !== 'high',
    'A positional pairing with the input array would have produced high here — it must not',
  );

  for (let i = 0; i < result.sessions.length; i += 1) {
    assertEqual(
      result.contexts[i].sessionId,
      result.sessions[i].sessionId,
      'Each context sits beside its own session at every index',
    );
  }

  console.log('  ✓ [oldest, middle, newest] in → [newest, middle, oldest] out, tags intact');
}

// ── T9.4: invalid persisted context degrades to null ─────────────────────────
{
  console.log('\nT9.4: unparseable persisted context degrades to null, never a guess');

  const rows: HistoryRow[] = [
    {
      session_id: 's-junk',
      exercise_id: 'ex-1',
      workout_sessions: {
        completed_at: '2026-08-01T10:00:00.000Z',
        is_light_session: false,
        // Values that could only arrive from a future/rogue writer.
        readiness: 'exhausted' as never,
        phase_at_session: 'bulk' as never,
      },
      set_entries: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, logged_at: null, rir: 9 },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, logged_at: null, rir: -1 },
        { set_index: 2, values: { weight: 100, reps: 9 }, set_type: 'working', is_completed: true, logged_at: null, rir: 2.5 },
      ],
    },
  ];

  const result = mapHistoryRows(rows);

  assertEqual(
    result.contexts[0],
    { sessionId: 's-junk', readiness: null, phaseAtSession: null, isLightSession: false },
    'An unrecognised readiness/phase degrades to null — the "never asked" neutral, not a fabricated level',
  );
  assertEqual(
    result.observationSessions[0].sets.map((set) => set.rir ?? null),
    [null, null, null],
    'Out-of-range RIR degrades to null; 9, -1 and 2.5 are not RIR values',
  );
  assertEqual(
    result.sessions[0].sets.map((set) => set.values),
    [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 9 }],
    'Bad optional context never damages the recorded work',
  );

  console.log('  ✓ junk readiness/phase/RIR → null; the sets survive intact');
}

// ── T9.5: existing exclusions and embed shapes are preserved ─────────────────
{
  console.log('\nT9.5: light sessions stay excluded; array-shaped embeds still work');

  const rows: HistoryRow[] = [
    {
      session_id: 's-light',
      exercise_id: 'ex-1',
      // A user-driven exclusion. Readiness is orthogonal and never a substitute (§13).
      workout_sessions: {
        completed_at: '2026-08-02T10:00:00.000Z',
        is_light_session: true,
        readiness: 'high',
        phase_at_session: 'build',
      },
      set_entries: [
        { set_index: 0, values: { weight: 60, reps: 10 }, set_type: 'working', is_completed: true, logged_at: null },
      ],
    },
    {
      session_id: 's-array-embed',
      exercise_id: 'ex-1',
      // PostgREST sometimes returns the embedded parent as an array.
      workout_sessions: [
        { completed_at: '2026-08-01T10:00:00.000Z', is_light_session: false, readiness: 'normal', phase_at_session: null },
      ],
      set_entries: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, logged_at: null },
      ],
    },
    {
      session_id: 's-no-parent',
      exercise_id: 'ex-1',
      workout_sessions: null,
      set_entries: [],
    },
  ];

  const result = mapHistoryRows(rows);

  assertEqual(
    result.sessions.map((session) => session.sessionId),
    ['s-array-embed'],
    'Light sessions and parentless rows are dropped, exactly as today',
  );
  assertEqual(result.contexts.length, 1, 'A dropped session contributes no context');
  assertEqual(
    result.contexts[0],
    { sessionId: 's-array-embed', readiness: 'normal', phaseAtSession: null, isLightSession: false },
    'An array-shaped embed still yields context; a null phase stays null',
  );
  assertEqual(
    result.observationSessions.length,
    result.sessions.length,
    'All three output arrays stay the same length',
  );

  console.log('  ✓ light session excluded, array embed handled, null parent skipped');
}

// ── F2.5: one batch's rows stay grouped by exercise ──────────────────────────
{
  console.log('\nF2.5: batch history rows remain isolated and newest-first per exercise');

  const exOneOld = legacyRow('ex-1-old', '2026-07-20T10:00:00.000Z');
  const exOneNew = legacyRow('ex-1-new', '2026-08-01T10:00:00.000Z');
  const exTwo = legacyRow('ex-2-only', '2026-07-27T10:00:00.000Z');
  exTwo.exercise_id = 'ex-2';

  const grouped = mapHistoryRowsByExercise(
    [exOneOld, exTwo, exOneNew],
    ['ex-1', 'ex-2', 'ex-without-history'],
  );

  assertEqual(
    grouped.get('ex-1')?.map((session) => session.sessionId),
    ['ex-1-new', 'ex-1-old'],
    'Each exercise keeps only its rows, newest-first',
  );
  assertEqual(
    grouped.get('ex-2')?.map((session) => session.sessionId),
    ['ex-2-only'],
    'Rows for another selected exercise never leak into ex-1 history',
  );
  assertEqual(
    grouped.get('ex-without-history'),
    [],
    'Selected first-time exercises receive an empty history array',
  );

  console.log('  ✓ grouped by exercise with no cross-exercise history leakage');
}

// ── T9.6: the loader takes one injectable seam and touches no network ────────
async function testLoaderSeam() {
  console.log('\nT9.6: loadHistorySessionsWithContext reads through an injectable fetcher');

  const rows = [legacyRow('s-a', '2026-08-01T10:00:00.000Z')];
  const requested: string[] = [];

  const fakeFetcher: HistoryRowFetcher = async (exerciseId: string) => {
    requested.push(exerciseId);
    return rows;
  };

  const result = await loadHistorySessionsWithContext(fakeFetcher, 'ex-1');

  assertEqual(requested, ['ex-1'], 'The exercise id is passed straight to the fetcher, once');
  assertEqual(result, mapHistoryRows(rows), 'The loader is the fetcher plus the pure mapper, nothing more');

  const empty = await loadHistorySessionsWithContext(async () => [], 'ex-1');
  assertEqual(
    empty,
    { sessions: [], observationSessions: [], contexts: [] },
    'A first-ever exercise yields three empty arrays, never a throw',
  );

  console.log('  ✓ one seam, no Supabase client, no network');
}

// ── T9.7: the existing loader keeps its exact contract ───────────────────────
{
  console.log('\nT9.7: loadHistorySessions remains (supabase, exerciseId) => Promise<ProgressHistorySession[]>');

  // Compile-time contract: every existing call site must keep type-checking.
  type LegacyLoader = (supabase: SupabaseClient, exerciseId: string) => Promise<ProgressHistorySession[]>;
  const legacyContract: LegacyLoader = loadHistorySessions;

  assertEqual(legacyContract.length, 2, 'Still exactly two parameters — no caller has to change');
  assert(typeof loadHistorySessions === 'function', 'loadHistorySessions is still exported as a function');

  console.log('  ✓ signature and return type unchanged (compat wrapper)');
}

async function main() {
  await testLoaderSeam();

  console.log('\n✅ All History context (T9) tests passed!');
  console.log('Coverage verified:');
  console.log('  ✓ Legacy rows map without throwing; sessions output is deep-equal to today');
  console.log('  ✓ readiness / phase_at_session / per-set rir reach contexts and observationSessions');
  console.log('  ✓ Context binds by sessionId, surviving the newest-first re-sort');
  console.log('  ✓ Invalid persisted readiness / phase / RIR degrade to null');
  console.log('  ✓ Light sessions, array embeds and null parents behave exactly as before');
  console.log('  ✓ The loader depends on one injectable fetcher — no live Supabase in tests');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
