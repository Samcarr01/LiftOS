/**
 * Cycle 1 — RED — T1: Observation purity
 *
 * Run with: npx tsx src/lib/workout/__tests__/observation.spec.ts
 *
 * Plan: .hermes/plans/2026-08-06-cut-aware-progression-v1.md §2.1, §11 E1–E4,
 * §13 (mixed set types, cardio), §15 Step 1.
 *
 * This file is written BEFORE `../observation` exists. It defines the wished-for
 * API of Layer 1:
 *
 *   buildSessionObservations(sessions, schema, repRange): SessionObservation[]
 *
 * The single governing rule of this layer is: **record objectively**. Phase,
 * readiness, bodyweight and confidence are structurally incapable of reaching
 * it — not by convention, but because the signature has nowhere to put them.
 */

import {
  buildSessionObservations,
  type ObservationSession,
  type SessionObservation,
  type RepRange,
} from '../observation';
import type { ProgressHistorySession } from '../guided-progression';
import type { TrackingSchema } from '@/types/tracking';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WEIGHT_REPS_SCHEMA: TrackingSchema = {
  fields: [
    { key: 'weight', label: 'Weight', type: 'number', unit: 'kg', optional: false },
    { key: 'reps', label: 'Reps', type: 'number', optional: false },
  ],
};

const LAPS_SCHEMA: TrackingSchema = {
  fields: [
    { key: 'laps', label: 'Laps', type: 'number', optional: false },
  ],
};

const TIME_SCHEMA: TrackingSchema = {
  fields: [
    { key: 'duration', label: 'Duration', type: 'number', unit: 'seconds', optional: false },
  ],
};

const RANGE_8_12: RepRange = { min: 8, max: 12 };

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

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Assertion failed: ${message}\n  Expected: ${expected} ±${tolerance}\n  Actual: ${actual}`,
    );
  }
}

/** Epley, duplicated here on purpose so the test never imports the engine's maths. */
function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

console.log('Running Observation (T1) tests...\n');

// ── T1.1: phase/readiness are structurally absent from the input ─────────────
{
  console.log('T1.1: buildSessionObservations takes no context parameter');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-latest',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 9 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  // The signature is the enforcement mechanism: exactly three required
  // parameters — sessions, schema, repRange. No fourth context slot, and no
  // optional context parameter smuggled in behind a default value.
  assertEqual(
    buildSessionObservations.length,
    3,
    'buildSessionObservations must accept exactly 3 parameters (sessions, schema, repRange) — no context slot',
  );

  const baseline = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  // Even if a caller force-feeds context past the type system, nothing may change.
  type LooseBuilder = (...args: unknown[]) => SessionObservation[];
  const loose = buildSessionObservations as unknown as LooseBuilder;

  const withCut = loose(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12, {
    phase: 'cut',
    readiness: 'very_low',
    bodyWeightKg: 78,
    progressionConfidence: 0.1,
  });
  const withBuild = loose(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12, {
    phase: 'build',
    readiness: 'high',
    bodyWeightKg: 92,
    progressionConfidence: 0.99,
  });

  assertEqual(withCut, baseline, 'Injected cut/very_low context must not alter observations');
  assertEqual(withBuild, baseline, 'Injected build/high context must not alter observations');
  assertEqual(withCut, withBuild, 'Two opposite contexts must produce byte-identical observations');

  console.log('  ✓ Arity is 3; smuggled context arguments change nothing');
}

// ── T1.2: 80×8 → 80×7 is an objective drop, whatever the context ─────────────
{
  console.log('\nT1.2: 80×8 → 80×7 is recorded as a drop, uninterpreted');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-newest',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 80, reps: 8 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 80, reps: 8 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 80, reps: 7 }, set_type: 'working', is_completed: true },
      ],
    },
    {
      sessionId: 's-older',
      completedAt: '2026-07-29T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 80, reps: 8 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 80, reps: 8 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 80, reps: 8 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const observations = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(observations.length, 2, 'One observation per input session, order preserved');
  assertEqual(observations[0].sessionId, 's-newest', 'Input order (newest first) is preserved');
  assertEqual(observations[0].repVector, [8, 8, 7], 'The 7 is recorded as a 7 — never rounded up or excused');
  assertEqual(observations[1].repVector, [8, 8, 8], 'Prior session vector recorded verbatim');

  assert(
    observations[0].repVector[2] < observations[1].repVector[2],
    'The drop must be visible in the raw record',
  );

  // No readiness argument exists, so there is nothing to rewrite the rep with.
  type LooseBuilder = (...args: unknown[]) => SessionObservation[];
  const loose = buildSessionObservations as unknown as LooseBuilder;
  const veryLow = loose(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12, { readiness: 'very_low' });
  assertEqual(veryLow, observations, 'A very_low tag never rewrites a logged rep');

  console.log('  ✓ [8, 8, 7] stays [8, 8, 7] under every context');
}

// ── T1.3: working/top qualify; warmup/drop/failure do not ───────────────────
{
  console.log('\nT1.3: workingSets covers working + top, excludes warmup/drop/failure');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-mixed',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 60, reps: 8 }, set_type: 'warmup', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 110, reps: 6 }, set_type: 'top', is_completed: true },
        { set_index: 3, values: { weight: 70, reps: 12 }, set_type: 'drop', is_completed: true },
        { set_index: 4, values: { weight: 50, reps: 15 }, set_type: 'failure', is_completed: true },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(obs.workingSets.length, 2, 'Only the working set and the top set qualify');
  assertEqual(
    obs.workingSets.map((s) => s.setType),
    ['working', 'top'],
    'Qualifying set types, in logged order',
  );
  assertEqual(obs.workingSets.map((s) => s.setIndex), [1, 2], 'Original set indices are carried through');
  assertEqual(obs.repVector, [10, 6], 'repVector derives from qualifying sets only');
  assertEqual(obs.topLoad, 110, 'topLoad is the heaviest qualifying load, not the drop set');
  assert(typeof obs.hasRepDropoff === 'boolean', 'hasRepDropoff is always present as a raw boolean');
  assert(typeof obs.allSetsAtCeiling === 'boolean', 'allSetsAtCeiling is always present as a raw boolean');

  console.log('  ✓ warmup (60), drop (70) and failure (50) excluded from workingSets');
}

// ── T1.4: planned vs completed working-set counts ────────────────────────────
{
  console.log('\nT1.4: plannedWorkingSetCount counts rows; completedWorkingSetCount counts work done');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-open-set',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 60, reps: 8 }, set_type: 'warmup', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 3, values: { weight: 100, reps: 9 }, set_type: 'working', is_completed: true },
        // Planned but never logged — the row exists, the work does not.
        { set_index: 4, values: {}, set_type: 'working', is_completed: false },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(obs.plannedWorkingSetCount, 4, 'All four working rows are planned, completed or not');
  assertEqual(obs.completedWorkingSetCount, 3, 'Only three working sets were actually completed');
  assertEqual(
    obs.workingSets.length,
    obs.completedWorkingSetCount,
    'workingSets holds the completed qualifying sets — planned-but-open rows are counted, not analysed',
  );
  assertEqual(obs.repVector, [10, 10, 9], 'The open row contributes no rep');
  assertEqual(obs.totalVolumeKg, 2900, 'Volume ignores the open row: 100×10 + 100×10 + 100×9');

  console.log('  ✓ planned 4 / completed 3; the warmup counts toward neither');
}

// ── T1.5: e1RM, repVector, volume and final-set RIR are raw facts ────────────
{
  console.log('\nT1.5: e1RM, repVector, volume and final completed working-set RIR are raw');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-raw-facts',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true, rir: 3 },
        { set_index: 1, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true, rir: null },
        { set_index: 2, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true, rir: 1 },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(obs.repVector, [12, 12, 12], 'repVector is the logged reps, in order');
  assertClose(obs.avgReps, 12, 1e-9, 'avgReps is the plain mean of the rep vector');
  assertClose(obs.bestE1rm, epley(100, 12), 1e-9, 'bestE1rm is Epley over qualifying sets (140)');
  assertEqual(obs.totalVolumeKg, 3600, 'totalVolumeKg = Σ weight × reps over qualifying sets');
  assertEqual(obs.topLoad, 100, 'topLoad is the heaviest qualifying load');
  assertEqual(obs.allSetsAtCeiling, true, 'All three sets sit at the 12-rep ceiling');

  // Per-set facts are individually inspectable.
  assertClose(obs.workingSets[0].e1rm, epley(100, 12), 1e-9, 'Per-set e1rm is Epley on that set');
  assertEqual(obs.workingSets[0].load, 100, 'Per-set load reads the schema load key');
  assertEqual(obs.workingSets[0].reps, 12, 'Per-set reps read verbatim');
  assertEqual(obs.workingSets[0].volumeKg, 1200, 'Per-set volume is load × reps');
  assertEqual(obs.workingSets[0].isCompleted, true, 'Completion flag is carried, not inferred');
  assertEqual(obs.workingSets[0].values, { weight: 100, reps: 12 }, 'Raw values survive untouched');

  // RIR is recorded, never judged. 3 means "3+"; it is not clamped or scaled here.
  assertEqual(obs.finalWorkingSetRir, 1, 'RIR of the final completed working set, verbatim');

  console.log('  ✓ e1RM 140, volume 3600, finalWorkingSetRir 1 — all raw');
}

{
  console.log('\nT1.5b: finalWorkingSetRir reads the final COMPLETED working set');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-open-tail',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, rir: 3 },
        { set_index: 1, values: { weight: 100, reps: 9 }, set_type: 'working', is_completed: true, rir: 2 },
        { set_index: 2, values: {}, set_type: 'working', is_completed: false, rir: 0 },
        { set_index: 3, values: { weight: 70, reps: 15 }, set_type: 'drop', is_completed: true, rir: 0 },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(obs.finalWorkingSetRir, 2, 'Open rows and drop sets never supply the session RIR');
  assertEqual(obs.plannedWorkingSetCount, 3, 'The open working row is still planned');
  assertEqual(obs.completedWorkingSetCount, 2, 'Two working sets completed');

  console.log('  ✓ finalWorkingSetRir = 2 (last completed working set), not 0 from the open/drop rows');
}

{
  console.log('\nT1.5c: no RIR logged anywhere ⇒ finalWorkingSetRir is null (absent, not zero)');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-no-rir',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);
  assertEqual(obs.finalWorkingSetRir, null, 'Never asked ⇒ null. Absence is not RIR 0.');

  console.log('  ✓ Missing RIR is null, never coerced to 0');
}

// ── T1.6: cardio / non-weight schemas observe cleanly with e1rm 0 ────────────
{
  console.log('\nT1.6: cardio and other non-weight schemas produce e1rm 0');

  const lapSessions: ObservationSession[] = [
    {
      sessionId: 's-laps',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { laps: 6 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { laps: 5 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const [laps] = buildSessionObservations(lapSessions, LAPS_SCHEMA, { min: 0, max: 0 });

  assertEqual(laps.bestE1rm, 0, 'Laps carry no e1RM');
  assertEqual(laps.workingSets.map((s) => s.e1rm), [0, 0], 'Every lap set has e1rm 0');
  assertEqual(laps.workingSets.map((s) => s.load), [0, 0], 'No load key in the schema ⇒ load 0');
  assertEqual(laps.totalVolumeKg, 0, 'No kg volume without a load key');
  assertEqual(laps.completedWorkingSetCount, 2, 'Cardio sessions still count their sets');
  assertEqual(laps.plannedWorkingSetCount, 2, 'Cardio sessions still count their planned rows');

  const timeSessions: ObservationSession[] = [
    {
      sessionId: 's-time',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { duration: 90 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const [timed] = buildSessionObservations(timeSessions, TIME_SCHEMA, { min: 0, max: 0 });

  assertEqual(timed.bestE1rm, 0, 'Duration-only work carries no e1RM');
  assertEqual(timed.totalVolumeKg, 0, 'Duration-only work carries no kg volume');
  assertEqual(timed.repVector, [], 'No reps field ⇒ empty rep vector, not [0]');
  assertEqual(timed.workingSets.length, 1, 'The set is still observed');
  assertEqual(timed.finalWorkingSetRir, null, 'No RIR logged on a timed hold');

  console.log('  ✓ laps and duration observed with e1rm 0 and no invented volume');
}

// ── T1.7: fixture compatibility with the existing engine input type ──────────
{
  console.log('\nT1.7: existing ProgressHistorySession fixtures feed the observer unchanged');

  const legacy: ProgressHistorySession[] = [
    {
      sessionId: 's-legacy',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 6 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 6 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 5 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  // Compile-time contract: ObservationSession widens ProgressHistorySession with
  // optional per-set `rir` only. Every existing fixture must remain valid input.
  const asObservationInput: ObservationSession[] = legacy;

  const [obs] = buildSessionObservations(asObservationInput, WEIGHT_REPS_SCHEMA, { min: 3, max: 8 });

  assertEqual(obs.repVector, [6, 6, 5], 'Legacy fixture observed verbatim');
  assertEqual(obs.finalWorkingSetRir, null, 'Legacy rows carry no RIR');
  assertEqual(obs.sessionId, 's-legacy', 'Session identity preserved');
  assertEqual(obs.completedAt, '2026-07-30T10:00:00Z', 'completedAt preserved for downstream gap maths');

  console.log('  ✓ ProgressHistorySession is assignable to ObservationSession');
}

// ── T1.8: rows are ordered by set_index before any derived fact ──────────────
{
  console.log('\nT1.8: set rows are sorted by set_index before repVector/RIR/drop-off are derived');

  // Rows arrive out of order — Postgres gives no ordering guarantee unless one is
  // asked for, and `load-history.ts` does not order the nested set_entries select.
  // Logical set order is `set_index`, never array position.
  const sessions: ObservationSession[] = [
    {
      sessionId: 's-unordered',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 2, values: { weight: 100, reps: 8 }, set_type: 'working', is_completed: true, rir: 0 },
        { set_index: 0, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true, rir: 3 },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true, rir: 2 },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(
    obs.workingSets.map((s) => s.setIndex),
    [0, 1, 2],
    'Input order [2, 0, 1] must be observed in logical set_index order [0, 1, 2]',
  );
  assertEqual(
    obs.repVector,
    [12, 10, 8],
    'repVector follows set_index order — the session ran 12, 10, 8, not 8, 12, 10',
  );
  assertEqual(
    obs.hasRepDropoff,
    true,
    'Rep drop-off compares the last set to the first in set_index order: 8 < 12',
  );
  assertEqual(
    obs.finalWorkingSetRir,
    0,
    'The final working set is set_index 2 (rir 0), not whichever row happened to arrive last',
  );

  console.log('  ✓ [2, 0, 1] observed as [0, 1, 2]; drop-off and RIR read the true final set');
}

// ── T1.9: an unknown set_type is excluded, never coerced to working ──────────
{
  console.log('\nT1.9: an unknown set_type (cooldown) is excluded, not treated as a working set');

  const sessions: ObservationSession[] = [
    {
      sessionId: 's-cooldown',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
        // Not a progression set type. It is not evidence, and it is not a working set.
        { set_index: 2, values: { weight: 20, reps: 5 }, set_type: 'cooldown', is_completed: true },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(obs.workingSets.length, 2, 'Only the two genuine working sets qualify');
  assertEqual(
    obs.workingSets.map((s) => s.setType),
    ['working', 'working'],
    'An unrecognised set_type is never relabelled as working',
  );
  assertEqual(obs.repVector, [12, 12], 'The cooldown 5 never enters the rep vector');
  assertEqual(
    obs.allSetsAtCeiling,
    true,
    'Both working sets sit at the 12 ceiling — a cooldown must not sink the ceiling evidence',
  );
  assertEqual(obs.plannedWorkingSetCount, 2, 'Two working rows were planned, not three');
  assertEqual(obs.hasRepDropoff, false, 'No drop-off across 12, 12 — the cooldown is not a drop');
  assertEqual(obs.totalVolumeKg, 2400, 'Volume covers the working sets only: 100×12 + 100×12');

  console.log('  ✓ cooldown excluded from workingSets, repVector, ceiling and volume');
}

// ── T1.10: fallback semantics match getProgressionSets() ─────────────────────
{
  console.log('\nT1.10: fallback filters completed rows FIRST, then looks for working/top');

  // Legacy contract (guided-progression.ts getProgressionSets):
  //   completed = rows that are completed and carry a value
  //   working   = completed ∩ {working, top}
  //   result    = working.length > 0 ? working : completed
  // So an open working row cannot suppress completed warmups.
  const sessions: ObservationSession[] = [
    {
      sessionId: 's-open-working-only',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 60, reps: 10 }, set_type: 'warmup', is_completed: true },
        { set_index: 1, values: { weight: 70, reps: 8 }, set_type: 'warmup', is_completed: true },
        // Started and abandoned: the row exists, the work does not.
        { set_index: 2, values: {}, set_type: 'working', is_completed: false },
      ],
    },
  ];

  const [obs] = buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, RANGE_8_12);

  assertEqual(
    obs.workingSets.length,
    2,
    'No completed working/top row exists ⇒ fall back to the completed rows, not to nothing',
  );
  assertEqual(
    obs.workingSets.map((s) => s.setType),
    ['warmup', 'warmup'],
    'The completed warmups are what was actually done, and what must be observed',
  );
  assertEqual(obs.repVector, [10, 8], 'Rep vector comes from the completed rows');
  assertEqual(obs.completedWorkingSetCount, 2, 'Two rows of real work were completed');
  assertEqual(obs.topLoad, 70, 'topLoad is the heaviest completed load');
  assertClose(obs.bestE1rm, epley(70, 8), 1e-9, 'bestE1rm is Epley over the completed rows');

  console.log('  ✓ An open working row plus completed warmups observes the warmups, not an empty session');
}

console.log('\n✅ All Observation (T1) tests passed!');
console.log('Coverage verified:');
console.log('  ✓ No phase/readiness/bodyweight parameter exists on the observer');
console.log('  ✓ A rep drop is recorded identically under every injected context');
console.log('  ✓ working/top qualify; warmup/drop/failure excluded');
console.log('  ✓ plannedWorkingSetCount counts open rows; completedWorkingSetCount does not');
console.log('  ✓ e1RM, repVector, volume and final completed working-set RIR are raw facts');
console.log('  ✓ Cardio and duration schemas observe with e1rm 0');
console.log('  ✓ Rows are ordered by set_index before repVector / drop-off / final-set RIR');
console.log('  ✓ Unknown set types are excluded, never coerced to working');
console.log('  ✓ Fallback matches getProgressionSets(): completed rows first');
