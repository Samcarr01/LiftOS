/**
 * Cycle 1 — RED — T2 (readiness weighting) + T3 (progression confidence)
 *
 * Run with: npx tsx src/lib/workout/__tests__/interpretation.spec.ts
 *
 * Plan: .hermes/plans/2026-08-06-cut-aware-progression-v1.md §2.2, §3, §3.1,
 * §3.2, §6.1, §11 E1–E4, §13 (missing phase/readiness/RIR), §15 Steps 2–3.
 *
 * This file is written BEFORE `../interpretation` exists. It defines the
 * wished-for API of Layer 2:
 *
 *   weighSessions(observations, contexts): WeightedSession[]
 *   assessTrend(weighted, repRange):       TrendAssessment
 *
 * Layer 2 is where context enters. It may weigh a session, it may never edit
 * one — every fixture below is built by the real observer, so an interpretation
 * that mutated a fact would have to do it in the open.
 *
 * Scope note: deload confidence (T6–T8) and phase prescription (T4) are NOT
 * tested here. Nothing in this file asserts a decision, a target or a threshold.
 */

import {
  weighSessions,
  assessTrend,
  baseEvidenceWeight,
  EVIDENCE_WEIGHTS,
  CONFIDENCE_COEFFICIENTS,
  LARGE_DROP_WEIGHT_FLOOR,
  REPEAT_DECLINE_WEIGHT_FLOOR,
  NEUTRAL_EFFORT_HEADROOM,
  NEUTRAL_READINESS_CONTEXT,
  type SessionContext,
  type TrendAssessment,
} from '../interpretation';
import {
  buildSessionObservations,
  type ObservationSession,
  type SessionObservation,
  type RepRange,
} from '../observation';
import type { Readiness } from '@/types/training-context';
import type { TrackingSchema } from '@/types/tracking';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WEIGHT_REPS_SCHEMA: TrackingSchema = {
  fields: [
    { key: 'weight', label: 'Weight', type: 'number', unit: 'kg', optional: false },
    { key: 'reps', label: 'Reps', type: 'number', optional: false },
  ],
};

const RANGE_8_12: RepRange = { min: 8, max: 12 };

type Rir = 0 | 1 | 2 | 3;

/** A weight+reps session at a single load. `finalRir` lands on the last working set. */
function session(
  sessionId: string,
  completedAt: string,
  load: number,
  reps: number[],
  finalRir: Rir | null = null,
): ObservationSession {
  return {
    sessionId,
    completedAt,
    sets: reps.map((r, i) => ({
      set_index: i,
      values: { weight: load, reps: r },
      set_type: 'working' as const,
      is_completed: true,
      ...(i === reps.length - 1 && finalRir !== null ? { rir: finalRir } : {}),
    })),
  };
}

function ctx(
  sessionId: string,
  readiness: Readiness | null,
  phaseAtSession: SessionContext['phaseAtSession'] = null,
): SessionContext {
  return { sessionId, readiness, phaseAtSession, isLightSession: false };
}

/** Sessions are newest-first everywhere, matching load-history.ts. */
function observe(sessions: ObservationSession[], repRange: RepRange = RANGE_8_12): SessionObservation[] {
  return buildSessionObservations(sessions, WEIGHT_REPS_SCHEMA, repRange);
}

function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

// ── Assertion helpers ────────────────────────────────────────────────────────

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

const EXPECTED_SIGNAL_KEYS = [
  'ceiling_evidence',
  'trend_component',
  'repeat_evidence',
  'effort_headroom',
  'readiness_context',
];

/** Every number shown to a user must be traceable — §2.2. */
function assertSignalsWellFormed(assessment: TrendAssessment, label: string) {
  const coefficients = CONFIDENCE_COEFFICIENTS as unknown as Record<string, number>;

  assertEqual(
    assessment.signals.map((s) => s.key).slice().sort(),
    EXPECTED_SIGNAL_KEYS.slice().sort(),
    `${label}: exactly the five progression signals are reported, one row each`,
  );

  for (const signal of assessment.signals) {
    assert(
      signal.weight !== null && typeof signal.weight === 'number' && Number.isFinite(signal.weight),
      `${label}: signal "${signal.key}" must carry a non-null numeric coefficient`,
    );
    assert(signal.weight > 0, `${label}: signal "${signal.key}" coefficient must be > 0`);
    assertClose(
      signal.weight,
      coefficients[signal.key],
      1e-9,
      `${label}: signal "${signal.key}" coefficient matches the declared constant`,
    );
    assert(
      typeof signal.contribution === 'number' && Number.isFinite(signal.contribution),
      `${label}: signal "${signal.key}" must carry a numeric contribution`,
    );
    assert(
      signal.raw === null || Number.isFinite(signal.raw),
      `${label}: signal "${signal.key}" raw is a number or null (absent), never undefined/NaN`,
    );
  }

  const summed = assessment.signals.reduce((total, s) => total + s.contribution, 0);
  assertClose(
    summed,
    assessment.progressionConfidence,
    1e-9,
    `${label}: contributions must sum exactly to progressionConfidence — no hidden term`,
  );
}

function signalOf(assessment: TrendAssessment, key: string) {
  const found = assessment.signals.find((s) => s.key === key);
  if (!found) throw new Error(`Assertion failed: signal "${key}" is missing from the breakdown`);
  return found;
}

console.log('Running Interpretation (T2 + T3) tests...\n');

// ═════════════════════════════════════════════════════════════════════════════
// T2 — Readiness weighting
// ═════════════════════════════════════════════════════════════════════════════

// ── T2.1: the weight table, exactly ──────────────────────────────────────────
{
  console.log('T2.1: evidence weight table — high 1.15 / normal 1.00 / null 1.00 / low 0.70 / very_low 0.50');

  assertClose(EVIDENCE_WEIGHTS.high, 1.15, 1e-9, 'high = 1.15 (capped: one great day cannot dominate)');
  assertClose(EVIDENCE_WEIGHTS.normal, 1.0, 1e-9, 'normal = 1.00 (baseline)');
  assertClose(EVIDENCE_WEIGHTS.low, 0.7, 1e-9, 'low = 0.70 (counts, weighs less)');
  assertClose(EVIDENCE_WEIGHTS.very_low, 0.5, 1e-9, 'very_low = 0.50 (hard floor)');

  assertClose(baseEvidenceWeight('high'), 1.15, 1e-9, 'baseEvidenceWeight(high)');
  assertClose(baseEvidenceWeight('normal'), 1.0, 1e-9, 'baseEvidenceWeight(normal)');
  assertClose(baseEvidenceWeight('low'), 0.7, 1e-9, 'baseEvidenceWeight(low)');
  assertClose(baseEvidenceWeight('very_low'), 0.5, 1e-9, 'baseEvidenceWeight(very_low)');
  assertClose(baseEvidenceWeight(null), 1.0, 1e-9, 'baseEvidenceWeight(null) = 1.00 — never asked is not a bad day');

  for (const [key, value] of Object.entries(EVIDENCE_WEIGHTS)) {
    assert(value > 0, `EVIDENCE_WEIGHTS.${key} must never be 0 — rule 3/4: every eligible session stays in`);
    assert(value >= 0.5, `EVIDENCE_WEIGHTS.${key} must never fall below the 0.50 hard floor`);
  }

  console.log('  ✓ Table values exact; no entry is zero');
}

// ── T2.2: the table applied end to end, and never zero ──────────────────────
{
  console.log('\nT2.2: applied weights match the table; no readiness value ever yields 0');

  // Flat history — no decline, so no floor can be in play. The weight visible on
  // the newest session is the pure table lookup.
  const flat = [
    session('s3', '2026-08-01T10:00:00Z', 100, [10, 10, 10]),
    session('s2', '2026-07-29T10:00:00Z', 100, [10, 10, 10]),
    session('s1', '2026-07-26T10:00:00Z', 100, [10, 10, 10]),
  ];
  const observations = observe(flat);

  const levels: Array<[Readiness | null, number]> = [
    ['high', 1.15],
    ['normal', 1.0],
    [null, 1.0],
    ['low', 0.7],
    ['very_low', 0.5],
  ];

  for (const [readiness, expected] of levels) {
    const weighted = weighSessions(observations, [
      ctx('s3', readiness),
      ctx('s2', 'normal'),
      ctx('s1', 'normal'),
    ]);

    assertEqual(weighted.length, 3, `readiness=${readiness}: one weighted row per observation`);
    assertClose(
      weighted[0].evidenceWeight,
      expected,
      1e-9,
      `readiness=${readiness}: evidenceWeight = ${expected}`,
    );
    assertEqual(
      weighted[0].weightFloorApplied,
      null,
      `readiness=${readiness}: no floor applies to a flat, non-declining session`,
    );
    assertEqual(
      weighted[0].observation,
      observations[0],
      `readiness=${readiness}: the observation is carried through untouched`,
    );
    assertEqual(
      weighted[0].context.readiness,
      readiness,
      `readiness=${readiness}: the context is carried through untouched`,
    );

    for (const row of weighted) {
      assert(row.evidenceWeight > 0, `readiness=${readiness}: no session may be zero-weighted`);
      assert(row.evidenceWeight >= 0.5, `readiness=${readiness}: 0.50 is the hard floor`);
    }
  }

  console.log('  ✓ Every level lands on its table value; every weight > 0');
}

// ── T2.3: context is matched by sessionId, not array position ───────────────
{
  console.log('\nT2.3: contexts bind by sessionId, not by index');

  const sessions = [
    session('s-new', '2026-08-01T10:00:00Z', 100, [10, 10, 10]),
    session('s-old', '2026-07-29T10:00:00Z', 100, [10, 10, 10]),
  ];
  const observations = observe(sessions);

  const inOrder = weighSessions(observations, [ctx('s-new', 'low'), ctx('s-old', 'high')]);
  const reversed = weighSessions(observations, [ctx('s-old', 'high'), ctx('s-new', 'low')]);

  assertEqual(reversed, inOrder, 'Context array order must not change the result');
  assertClose(inOrder[0].evidenceWeight, 0.7, 1e-9, 's-new is the low session (0.70)');
  assertClose(inOrder[1].evidenceWeight, 1.15, 1e-9, 's-old is the high session (1.15)');

  // A session with no context row at all is treated as "never asked".
  const noContext = weighSessions(observations, []);
  assertClose(noContext[0].evidenceWeight, 1.0, 1e-9, 'Missing context row ⇒ weight 1.00, not an exclusion');
  assertEqual(noContext[0].context.readiness, null, 'Missing context row ⇒ readiness null');

  console.log('  ✓ Binding is by sessionId; a missing context row is neutral');
}

// ── T2.4: large-drop floor 0.85 at ≥12% below the weighted baseline (E4) ─────
{
  console.log('\nT2.4: E4 — large drop on a very_low day still counts (floor 0.85)');

  // Prior 100×[10,10,9] normal → e1RM 133.3. Latest 85×[6,5] very_low → e1RM 102.
  const sessions = [
    session('s-crash', '2026-08-01T10:00:00Z', 85, [6, 5], null),
    session('s-prior', '2026-07-29T10:00:00Z', 100, [10, 10, 9], null),
  ];
  const observations = observe(sessions);

  assertClose(observations[0].bestE1rm, epley(85, 6), 1e-9, 'Observed crash e1RM is 102');
  assertClose(observations[1].bestE1rm, epley(100, 10), 1e-9, 'Observed prior e1RM is 133.3');

  const weighted = weighSessions(observations, [ctx('s-crash', 'very_low'), ctx('s-prior', 'normal')]);

  assertClose(LARGE_DROP_WEIGHT_FLOOR, 0.85, 1e-9, 'The large-drop floor constant is 0.85');
  assertClose(
    weighted[0].evidenceWeight,
    0.85,
    1e-9,
    'A −23% e1RM drop floors at 0.85 despite the very_low tag — the drop is not discounted away',
  );
  assertEqual(weighted[0].weightFloorApplied, 'large_drop', 'The floor is recorded on the session');
  assert(
    weighted[0].evidenceWeight > EVIDENCE_WEIGHTS.very_low,
    'The floor takes the maximum of base weight and floor',
  );

  console.log('  ✓ very_low 0.50 raised to 0.85 by the large-drop floor');
}

// ── T2.5: a small drop on a very_low day is NOT floored ─────────────────────
{
  console.log('\nT2.5: a drop under 12% leaves the readiness weight alone');

  // 100×[9,9,8] → e1RM 130 vs prior 133.3: about −2.5%, well inside the band.
  const sessions = [
    session('s-slight', '2026-08-01T10:00:00Z', 100, [9, 9, 8]),
    session('s-prior', '2026-07-29T10:00:00Z', 100, [10, 10, 9]),
  ];
  const weighted = weighSessions(observe(sessions), [
    ctx('s-slight', 'very_low'),
    ctx('s-prior', 'normal'),
  ]);

  assertClose(weighted[0].evidenceWeight, 0.5, 1e-9, 'Small drop ⇒ plain very_low weight 0.50');
  assertEqual(weighted[0].weightFloorApplied, null, 'No floor recorded for a sub-threshold drop');

  console.log('  ✓ 12% is a real threshold, not a rubber stamp');
}

// ── T2.6: repeat-decline floor 0.85 on the second consecutive low decline ────
{
  console.log('\nT2.6: two consecutive declining low-readiness sessions — the second floors at 0.85');

  // 133.3 → 130 → 126.7: each step declines, each step under 12%.
  const sessions = [
    session('s-third', '2026-08-01T10:00:00Z', 95, [10, 10, 10]),
    session('s-second', '2026-07-29T10:00:00Z', 97.5, [10, 10, 10]),
    session('s-first', '2026-07-26T10:00:00Z', 100, [10, 10, 10]),
  ];
  const weighted = weighSessions(observe(sessions), [
    ctx('s-third', 'low'),
    ctx('s-second', 'low'),
    ctx('s-first', 'normal'),
  ]);

  assertClose(REPEAT_DECLINE_WEIGHT_FLOOR, 0.85, 1e-9, 'The repeat-decline floor constant is 0.85');
  assertClose(
    weighted[0].evidenceWeight,
    0.85,
    1e-9,
    'Second consecutive low decline floors at 0.85 — repeated underperformance is itself a signal',
  );
  assertEqual(weighted[0].weightFloorApplied, 'repeat_decline', 'The floor reason is recorded');

  assertClose(weighted[1].evidenceWeight, 0.7, 1e-9, 'The first low decline keeps the plain 0.70 weight');
  assertEqual(weighted[1].weightFloorApplied, null, 'One low decline alone triggers no floor');
  assertClose(weighted[2].evidenceWeight, 1.0, 1e-9, 'The normal session is unaffected');

  console.log('  ✓ 0.70 for the first, 0.85 for the second');
}

// ── T2.7: missing readiness is neutral, and reproduces today's plain mean ────
{
  console.log('\nT2.7: missing readiness is neutral — the weighted baseline collapses to a plain mean');

  const sessions = [
    session('s3', '2026-08-01T10:00:00Z', 95, [10, 10, 10]),
    session('s2', '2026-07-29T10:00:00Z', 97.5, [10, 10, 10]),
    session('s1', '2026-07-26T10:00:00Z', 100, [10, 10, 10]),
  ];
  const observations = observe(sessions);

  const noneAsked = weighSessions(observations, [ctx('s3', null), ctx('s2', null), ctx('s1', null)]);
  const allNormal = weighSessions(observations, [
    ctx('s3', 'normal'),
    ctx('s2', 'normal'),
    ctx('s1', 'normal'),
  ]);

  assertEqual(
    noneAsked.map((w) => w.evidenceWeight),
    allNormal.map((w) => w.evidenceWeight),
    'null readiness weighs exactly the same as normal',
  );
  for (const row of noneAsked) {
    assertClose(row.evidenceWeight, 1.0, 1e-9, 'Every legacy session weighs 1.00');
    assertEqual(row.weightFloorApplied, null, 'No floors on an all-null history of small drops');
  }

  const trend = assessTrend(noneAsked, RANGE_8_12);
  const plainMeanE1rm = (epley(100, 10) + epley(97.5, 10) + epley(95, 10)) / 3;
  const plainMeanLoad = (100 + 97.5 + 95) / 3;

  assertClose(
    trend.weightedBaselineE1rm,
    plainMeanE1rm,
    1e-9,
    'With every weight 1.00 the weighted baseline IS the plain mean (backwards compatibility, §18.2)',
  );
  assertClose(
    trend.weightedBaselineLoad,
    plainMeanLoad,
    1e-9,
    'Same for the load baseline',
  );

  const normalTrend = assessTrend(allNormal, RANGE_8_12);
  assertClose(
    normalTrend.progressionConfidence,
    trend.progressionConfidence,
    1e-9,
    'Never-asked and normal produce identical confidence',
  );

  console.log('  ✓ A legacy user with no readiness data sees today\'s maths exactly');
}

// ═════════════════════════════════════════════════════════════════════════════
// T3 — Progression confidence (§6.1)
// ═════════════════════════════════════════════════════════════════════════════

// ── T3.1: the declared coefficients ─────────────────────────────────────────
{
  console.log('\nT3.1: confidence coefficients are declared constants summing to 1.00');

  const coefficients = CONFIDENCE_COEFFICIENTS as unknown as Record<string, number>;

  assertClose(coefficients.ceiling_evidence, 0.4, 1e-9, 'ceilingEvidence coefficient 0.40');
  assertClose(coefficients.trend_component, 0.25, 1e-9, 'trendComponent coefficient 0.25');
  assertClose(coefficients.repeat_evidence, 0.15, 1e-9, 'repeatEvidence coefficient 0.15');
  assertClose(coefficients.effort_headroom, 0.1, 1e-9, 'effortHeadroom coefficient 0.10');
  assertClose(coefficients.readiness_context, 0.1, 1e-9, 'readinessContext coefficient 0.10');

  const total = EXPECTED_SIGNAL_KEYS.reduce((sum, key) => sum + coefficients[key], 0);
  assertClose(total, 1.0, 1e-9, 'Coefficients sum to 1.00 so confidence is bounded 0…1');

  assertClose(NEUTRAL_EFFORT_HEADROOM, 0.5, 1e-9, 'Missing RIR takes the neutral 0.5');
  assertClose(NEUTRAL_READINESS_CONTEXT, 0.8, 1e-9, 'Missing readiness takes the neutral 0.8 (= normal)');

  console.log('  ✓ 0.40 / 0.25 / 0.15 / 0.10 / 0.10, neutrals 0.5 and 0.8');
}

// ── T3.2: E1 — legacy user, nothing optional filled in → 0.68 ───────────────
{
  console.log('\nT3.2: E1 — [100×12, 100×12, 100×12], no readiness, no RIR → 0.68');

  const observations = observe([session('e1', '2026-08-01T10:00:00Z', 100, [12, 12, 12])]);
  const weighted = weighSessions(observations, [ctx('e1', null)]);
  const trend = assessTrend(weighted, RANGE_8_12);

  assertClose(trend.progressionConfidence, 0.68, 0.005, 'E1 progressionConfidence = 0.68');
  assertEqual(trend.direction, 'stable', 'A single session reads as stable, not improving');
  assertEqual(trend.cleanQualifyingRun, 1, 'One session at the ceiling ⇒ a clean run of 1');
  assertSignalsWellFormed(trend, 'E1');

  const ceiling = signalOf(trend, 'ceiling_evidence');
  assertClose(ceiling.raw ?? NaN, 1.0, 1e-9, 'E1: all three sets at the 12 ceiling ⇒ raw 1.0');
  assertClose(ceiling.contribution, 0.4, 1e-9, 'E1: ceiling contributes 0.40');

  const trendSignal = signalOf(trend, 'trend_component');
  assertClose(trendSignal.raw ?? NaN, 0.6, 1e-9, 'E1: stable ⇒ raw 0.6');
  assertClose(trendSignal.contribution, 0.15, 1e-9, 'E1: trend contributes 0.15');

  const repeat = signalOf(trend, 'repeat_evidence');
  assertClose(repeat.raw ?? NaN, 0, 1e-9, 'E1: no prior session ⇒ raw 0');
  assertClose(repeat.contribution, 0, 1e-9, 'E1: repeat evidence contributes nothing');

  const effort = signalOf(trend, 'effort_headroom');
  assertEqual(effort.raw, null, 'E1: RIR never logged ⇒ raw null (absent)');
  assertClose(effort.contribution, 0.05, 1e-9, 'E1: absent RIR takes the neutral 0.5 → 0.05');

  const readiness = signalOf(trend, 'readiness_context');
  assertEqual(readiness.raw, null, 'E1: readiness never asked ⇒ raw null (absent)');
  assertClose(readiness.contribution, 0.08, 1e-9, 'E1: absent readiness takes the neutral 0.8 → 0.08');

  console.log('  ✓ 0.40 + 0.15 + 0.00 + 0.05 + 0.08 = 0.68, every term named');
}

// ── T3.3: E2 — cut fixture, first clean session → 0.76 ──────────────────────
{
  console.log('\nT3.3: E2 — one clean session at the ceiling, RIR 2, normal → 0.76');

  const observations = observe([
    session('e2-latest', '2026-08-01T10:00:00Z', 100, [12, 12, 12], 2),
    session('e2-prior', '2026-07-29T10:00:00Z', 100, [12, 11, 10]),
  ]);
  const weighted = weighSessions(observations, [
    ctx('e2-latest', 'normal', 'cut'),
    ctx('e2-prior', 'normal', 'cut'),
  ]);
  const trend = assessTrend(weighted, RANGE_8_12);

  assertClose(trend.progressionConfidence, 0.76, 0.005, 'E2 first qualifying run = 0.76');
  assertEqual(trend.cleanQualifyingRun, 1, 'Only the latest session cleared the ceiling');
  assertSignalsWellFormed(trend, 'E2 first run');

  assertClose(signalOf(trend, 'ceiling_evidence').contribution, 0.4, 1e-9, 'E2: ceiling 0.40');
  assertClose(signalOf(trend, 'trend_component').contribution, 0.15, 1e-9, 'E2: stable trend 0.15');
  assertClose(signalOf(trend, 'repeat_evidence').raw ?? NaN, 0.4, 1e-9, 'E2: prior session partially cleared ⇒ 0.4');
  assertClose(signalOf(trend, 'repeat_evidence').contribution, 0.06, 1e-9, 'E2: partial repeat evidence 0.06');
  assertClose(signalOf(trend, 'effort_headroom').raw ?? NaN, 0.7, 1e-9, 'E2: RIR 2 ⇒ raw 0.7');
  assertClose(signalOf(trend, 'effort_headroom').contribution, 0.07, 1e-9, 'E2: effort headroom 0.07');
  assertClose(signalOf(trend, 'readiness_context').raw ?? NaN, 0.8, 1e-9, 'E2: normal readiness ⇒ raw 0.8');
  assertClose(signalOf(trend, 'readiness_context').contribution, 0.08, 1e-9, 'E2: readiness context 0.08');

  // Interpretation is phase-blind. Phase is a prescription-layer lever only (§4).
  const asBuild = assessTrend(
    weighSessions(observations, [ctx('e2-latest', 'normal', 'build'), ctx('e2-prior', 'normal', 'build')]),
    RANGE_8_12,
  );
  assertClose(
    asBuild.progressionConfidence,
    trend.progressionConfidence,
    1e-9,
    'The phase recorded on a session never moves its confidence',
  );

  console.log('  ✓ 0.40 + 0.15 + 0.06 + 0.07 + 0.08 = 0.76, clean run 1');
}

// ── T3.4: E2 repeated — the clean session happens again → 0.85 ──────────────
{
  console.log('\nT3.4: E2 repeated — a second clean session at the ceiling → 0.85');

  const observations = observe([
    session('e2-third', '2026-08-04T10:00:00Z', 100, [12, 12, 12], 2),
    session('e2-latest', '2026-08-01T10:00:00Z', 100, [12, 12, 12], 2),
    session('e2-prior', '2026-07-29T10:00:00Z', 100, [12, 11, 10]),
  ]);
  const weighted = weighSessions(observations, [
    ctx('e2-third', 'normal', 'cut'),
    ctx('e2-latest', 'normal', 'cut'),
    ctx('e2-prior', 'normal', 'cut'),
  ]);
  const trend = assessTrend(weighted, RANGE_8_12);

  assertClose(trend.progressionConfidence, 0.85, 0.005, 'E2 repeated clean run = 0.85');
  assertEqual(trend.cleanQualifyingRun, 2, 'Two consecutive sessions cleared the ceiling');
  assertSignalsWellFormed(trend, 'E2 repeated');

  assertClose(
    signalOf(trend, 'repeat_evidence').raw ?? NaN,
    1.0,
    1e-9,
    'The prior session also cleared the ceiling ⇒ full repeat evidence',
  );
  assertClose(signalOf(trend, 'repeat_evidence').contribution, 0.15, 1e-9, 'Repeat evidence 0.15');

  console.log('  ✓ 0.40 + 0.15 + 0.15 + 0.07 + 0.08 = 0.85, clean run 2');
}

// ── T3.5: confidence stays bounded and traceable on a declining history ─────
{
  console.log('\nT3.5: signals stay well-formed on a declining, low-readiness history');

  const observations = observe([
    session('d3', '2026-08-01T10:00:00Z', 95, [8, 8, 7], 0),
    session('d2', '2026-07-29T10:00:00Z', 97.5, [9, 9, 8], 1),
    session('d1', '2026-07-26T10:00:00Z', 100, [10, 10, 9], 2),
  ]);
  const trend = assessTrend(
    weighSessions(observations, [ctx('d3', 'low'), ctx('d2', 'low'), ctx('d1', 'normal')]),
    RANGE_8_12,
  );

  assertSignalsWellFormed(trend, 'declining history');
  assert(
    trend.progressionConfidence >= 0 && trend.progressionConfidence <= 1,
    'progressionConfidence is bounded 0…1',
  );
  assertClose(
    signalOf(trend, 'ceiling_evidence').raw ?? NaN,
    0,
    1e-9,
    'No set reached the 12 ceiling ⇒ ceiling evidence 0',
  );
  assertClose(
    signalOf(trend, 'effort_headroom').raw ?? NaN,
    0.1,
    1e-9,
    'RIR 0 on the final working set ⇒ raw 0.1, the lowest headroom',
  );
  assertClose(
    signalOf(trend, 'readiness_context').raw ?? NaN,
    0.4,
    1e-9,
    'low readiness ⇒ raw 0.4',
  );
  assert(
    trend.progressionConfidence < 0.6,
    'A declining, at-effort, low-readiness history must not reach even the loosest bar',
  );

  console.log('  ✓ Bounded, fully itemised, and low for the right reasons');
}

// ── T3.6: three consecutive declines are a sharp decline (engine parity) ─────
{
  console.log('\nT3.6: three consecutive declines ⇒ sharp_decline, even while under 15% off peak');

  // The current engine (guided-progression.ts detectTrend) has TWO independent
  // routes to sharp_decline: `consecutiveDownRun >= 3` OR `dropFromPeak >= 15%`.
  // This fixture exercises the first with the second deliberately not firing.
  const sessions = [
    session('sd-4', '2026-08-05T10:00:00Z', 91, [10, 10, 10]),
    session('sd-3', '2026-08-01T10:00:00Z', 94, [10, 10, 10]),
    session('sd-2', '2026-07-29T10:00:00Z', 97.5, [10, 10, 10]),
    session('sd-1', '2026-07-26T10:00:00Z', 100, [10, 10, 10]),
  ];
  const observations = observe(sessions);
  const weighted = weighSessions(observations, [
    ctx('sd-4', null),
    ctx('sd-3', null),
    ctx('sd-2', null),
    ctx('sd-1', null),
  ]);

  // Guard: the peak escape hatch must NOT be what makes this pass.
  const peak = Math.max(...observations.map((o) => o.bestE1rm));
  const dropFromPeak = (peak - observations[0].bestE1rm) / peak;
  assert(
    dropFromPeak < 0.15,
    `The latest session is only ${(dropFromPeak * 100).toFixed(1)}% off peak — the 15% route must not fire here`,
  );
  assert(dropFromPeak >= 0.05, 'The run still clears the 5% noise floor, so this is not sub-threshold drift');

  const trend = assessTrend(weighted, RANGE_8_12);

  assertEqual(
    trend.direction,
    'sharp_decline',
    'Three consecutive declines are a sharp decline — matching detectTrend consecutiveDownRun >= 3 (§18.4)',
  );
  assertClose(
    signalOf(trend, 'trend_component').raw ?? NaN,
    0,
    1e-9,
    'sharp_decline contributes a trend component of 0.0, not the 0.2 of a plain decline',
  );

  console.log('  ✓ 133.3 → 129.3 → 125.3 → 121.3 reads as sharp_decline at 9% off peak');
}

// ── T3.7: one decline is not a decline (engine parity) ──────────────────────
{
  console.log('\nT3.7: a single decline stays stable; declining needs two consecutive declines');

  // 133.3 → 125.3 is a 6% drop: past the 5% noise floor, but it is ONE session.
  // The engine requires consecutiveDownRun >= 2 before calling anything declining.
  const single = weighSessions(
    observe([
      session('one-2', '2026-08-01T10:00:00Z', 94, [10, 10, 10]),
      session('one-1', '2026-07-29T10:00:00Z', 100, [10, 10, 10]),
    ]),
    [ctx('one-2', null), ctx('one-1', null)],
  );

  assertEqual(
    assessTrend(single, RANGE_8_12).direction,
    'stable',
    'One down session is noise, not a trend — matching detectTrend consecutiveDownRun >= 2',
  );

  // Positive control: add a second consecutive decline and it must flip.
  const double = weighSessions(
    observe([
      session('two-3', '2026-08-01T10:00:00Z', 94, [10, 10, 10]),
      session('two-2', '2026-07-29T10:00:00Z', 97.5, [10, 10, 10]),
      session('two-1', '2026-07-26T10:00:00Z', 100, [10, 10, 10]),
    ]),
    [ctx('two-3', null), ctx('two-2', null), ctx('two-1', null)],
  );

  assertEqual(
    assessTrend(double, RANGE_8_12).direction,
    'declining',
    'Two consecutive declines clearing the 5% floor are a genuine decline',
  );

  console.log('  ✓ One decline ⇒ stable; two ⇒ declining');
}

// ── T3.8: zero-e1RM / zero-load sessions never corrupt the baselines ────────
{
  console.log('\nT3.8: +0kg added-weight sessions do not corrupt the weighted baselines or the trend');

  // Bodyweight movement (§13): load key is `added_weight`, and at +0kg both the
  // load and the Epley e1RM are legitimately 0. The current engine's detectTrend
  // filters those sessions out of the trend window entirely (`a.e1rm > 0`), and a
  // zero must never be averaged in as if it were a real, terrible session.
  const BODYWEIGHT_SCHEMA: TrackingSchema = {
    fields: [
      { key: 'added_weight', label: 'Added weight', type: 'number', unit: 'kg', optional: false },
      { key: 'reps', label: 'Reps', type: 'number', optional: false },
    ],
  };

  function bwSession(
    sessionId: string,
    completedAt: string,
    addedWeight: number,
    reps: number[],
  ): ObservationSession {
    return {
      sessionId,
      completedAt,
      sets: reps.map((r, i) => ({
        set_index: i,
        values: { added_weight: addedWeight, reps: r },
        set_type: 'working' as const,
        is_completed: true,
      })),
    };
  }

  const observations = buildSessionObservations(
    [
      bwSession('bw-3', '2026-08-01T10:00:00Z', 10, [8, 8, 8]),
      bwSession('bw-2', '2026-07-29T10:00:00Z', 0, [10, 10, 10]), // bodyweight only
      bwSession('bw-1', '2026-07-26T10:00:00Z', 10, [8, 8, 8]),
    ],
    BODYWEIGHT_SCHEMA,
    RANGE_8_12,
  );

  // Observation is doing its job — the +0kg session genuinely carries no load.
  assertClose(observations[1].bestE1rm, 0, 1e-9, '+0kg session observes e1RM 0 (§13, added-weight at +0kg)');
  assertClose(observations[1].topLoad, 0, 1e-9, '+0kg session observes topLoad 0');
  assertClose(observations[0].bestE1rm, epley(10, 8), 1e-9, 'The +10kg sessions observe a real e1RM');

  const weighted = weighSessions(observations, [ctx('bw-3', null), ctx('bw-2', null), ctx('bw-1', null)]);
  const trend = assessTrend(weighted, RANGE_8_12);

  assertClose(
    trend.weightedBaselineE1rm,
    epley(10, 8),
    1e-9,
    'Zero-e1RM sessions are excluded from the e1RM baseline — a +0kg day is not a 0kg lift',
  );
  assertClose(
    trend.weightedBaselineLoad,
    10,
    1e-9,
    'Zero-load sessions are excluded from the load baseline — §5 prescribes at this number',
  );
  assertEqual(
    trend.direction,
    'stable',
    'Nothing changed between the two loaded sessions — a +0kg day in between is not improvement',
  );

  console.log('  ✓ Baselines 12.67 / 10 and a stable trend, not 8.44 / 6.67 and a phantom improvement');
}

console.log('\n✅ All Interpretation (T2 + T3) tests passed!');
console.log('Coverage verified:');
console.log('  ✓ Evidence weights exact: 1.15 / 1.00 / 1.00 / 0.70 / 0.50, never 0');
console.log('  ✓ Large-drop floor 0.85 at ≥12% below the weighted baseline');
console.log('  ✓ Repeat-decline floor 0.85 on the second consecutive low decline');
console.log('  ✓ Missing readiness is neutral — weighted baseline collapses to a plain mean');
console.log('  ✓ E1 = 0.68; E2 = 0.76 then 0.85 (±0.005)');
console.log('  ✓ Every SignalBreakdown has a non-null coefficient; contributions sum exactly');
console.log('  ✓ Missing RIR ⇒ neutral 0.5; missing readiness ⇒ neutral 0.8');
console.log('  ✓ Three consecutive declines ⇒ sharp_decline (engine parity, §18.4)');
console.log('  ✓ One decline ⇒ stable; two consecutive declines ⇒ declining');
console.log('  ✓ Zero-e1RM / zero-load sessions never enter the baselines or the trend');
