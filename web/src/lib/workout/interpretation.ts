/**
 * Layer 2 — Interpretation. Cut-Aware Progression v1, §2.2, §3, §3.1, §3.2, §6.1.
 *
 * Context enters here and only here. This layer may *weigh* a session; it may
 * never edit one — observations pass through by reference, untouched.
 *
 * Two responsibilities in v1:
 *   1. `weighSessions()`  — attach an evidence weight to each observed session.
 *   2. `assessTrend()`    — weighted baselines, trend direction, and a fully
 *                            itemised progression confidence.
 *
 * Every coefficient and threshold is a named constant in the block below so it
 * can be tuned without touching logic (§6, open decision 3). Nothing here makes
 * a decision, sets a target, or reads a training phase — that is prescription.
 */

import type { Readiness, TrainingPhase } from '@/types/training-context';
import type { RepRange, SessionObservation } from './observation';

// ── Tunable constants ────────────────────────────────────────────────────────

/**
 * Evidence weight per readiness level (§3). Rule 3/4: every eligible session
 * stays in the baseline — no completed session is ever weighted zero.
 * `is_light_session` remains the only exclusion mechanism.
 */
export const EVIDENCE_WEIGHTS: Record<Readiness, number> = {
  high: 1.15, // capped, so one great day cannot dominate a trend
  normal: 1.0,
  low: 0.7, // counts, weighs less
  very_low: 0.5, // hard floor — never lower, never zero
};

/** Never asked is not evidence of a bad day (§3, §13). */
export const MISSING_READINESS_WEIGHT = 1.0;

/** A session ≥12% below the weighted baseline e1RM floors here, whatever the tag (§3.1). */
export const LARGE_DROP_WEIGHT_FLOOR = 0.85;
export const LARGE_DROP_E1RM_THRESHOLD = 0.12;

/** Second consecutive declining low/very_low session floors here (§3.1). */
export const REPEAT_DECLINE_WEIGHT_FLOOR = 0.85;

/** Interpretation window — the newest N eligible sessions (§3.2). */
export const INTERPRETATION_WINDOW = 5;

/** Trend bands, carried over from the engine's existing noise floor (§3.2). */
export const E1RM_IMPROVING_BAND = 0.02;
export const E1RM_MEANINGFUL_DECLINE = 0.05;
export const E1RM_SHARP_DECLINE_FROM_PEAK = 0.15;

export type ProgressionSignalKey =
  | 'ceiling_evidence'
  | 'trend_component'
  | 'repeat_evidence'
  | 'effort_headroom'
  | 'readiness_context';

/** Progression confidence coefficients (§6.1). They sum to 1.00, so 0 ≤ confidence ≤ 1. */
export const CONFIDENCE_COEFFICIENTS: Record<ProgressionSignalKey, number> = {
  ceiling_evidence: 0.4,
  trend_component: 0.25,
  repeat_evidence: 0.15,
  effort_headroom: 0.1,
  readiness_context: 0.1,
};

/**
 * Missing-signal policy for progression (§6.1): an absent optional signal takes
 * an explicit neutral value. Absence never penalises a lifter who has not opted
 * into RIR or readiness — and never inflates their confidence either.
 * (The deload model, added in a later cycle, is deliberately asymmetric.)
 */
export const NEUTRAL_EFFORT_HEADROOM = 0.5;
export const NEUTRAL_READINESS_CONTEXT = 0.8; // matches `normal`

const TREND_COMPONENT: Record<TrendDirection, number> = {
  improving: 1.0,
  stable: 0.6,
  declining: 0.2,
  sharp_decline: 0.0,
};

const EFFORT_HEADROOM_BY_RIR: Record<0 | 1 | 2 | 3, number> = {
  3: 1.0, // "3+" — plenty left
  2: 0.7,
  1: 0.35,
  0: 0.1, // nothing left in the tank
};

const READINESS_CONTEXT: Record<Readiness, number> = {
  high: 1.0,
  normal: 0.8,
  low: 0.4,
  very_low: 0.2,
};

/** Prior session cleared every working set at the ceiling / some of them / none. */
const REPEAT_EVIDENCE_FULL = 1.0;
const REPEAT_EVIDENCE_PARTIAL = 0.4;
const REPEAT_EVIDENCE_NONE = 0.0;

// ── Types ────────────────────────────────────────────────────────────────────

export type TrendDirection = 'improving' | 'stable' | 'declining' | 'sharp_decline';

export type WeightFloor = 'large_drop' | 'repeat_decline';

export interface SessionContext {
  sessionId: string;
  /** `null` = never asked. */
  readiness: Readiness | null;
  /** The phase in force when the session was logged. Narrative only — never a lever here. */
  phaseAtSession: TrainingPhase | null;
  isLightSession: boolean;
}

export interface WeightedSession {
  observation: SessionObservation;
  context: SessionContext;
  /** 0.50 … 1.15 — never 0. */
  evidenceWeight: number;
  weightFloorApplied: WeightFloor | null;
}

export interface SignalBreakdown {
  key: string;
  /** The normalised signal value, or `null` when the signal is absent. */
  raw: number | null;
  /** Fixed coefficient. Never null. */
  weight: number;
  contribution: number;
}

export interface TrendAssessment {
  direction: TrendDirection;
  weightedBaselineE1rm: number;
  weightedBaselineLoad: number;
  /** Consecutive sessions, newest first, clearing the rep ceiling. */
  cleanQualifyingRun: number;
  /** 0…1. Always equal to the sum of `signals[].contribution`. */
  progressionConfidence: number;
  signals: SignalBreakdown[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function weightedMean(rows: Array<{ weight: number; value: number }>): number {
  const totalWeight = rows.reduce((total, row) => total + row.weight, 0);
  if (totalWeight <= 0) return 0;
  return rows.reduce((total, row) => total + row.weight * row.value, 0) / totalWeight;
}

function emptyContext(sessionId: string): SessionContext {
  return { sessionId, readiness: null, phaseAtSession: null, isLightSession: false };
}

/** Fraction of a session's working sets at or above the rep-range ceiling. */
function ceilingFraction(observation: SessionObservation, repRange: RepRange): number {
  if (repRange.max <= 0 || observation.repVector.length === 0) return 0;
  const cleared = observation.repVector.filter((reps) => reps >= repRange.max).length;
  return cleared / observation.repVector.length;
}

// ── Weighting (§3) ───────────────────────────────────────────────────────────

/** The readiness table lookup, before any floor is applied. */
export function baseEvidenceWeight(readiness: Readiness | null): number {
  if (readiness === null) return MISSING_READINESS_WEIGHT;
  return EVIDENCE_WEIGHTS[readiness];
}

function isLowReadiness(readiness: Readiness | null): boolean {
  return readiness === 'low' || readiness === 'very_low';
}

/**
 * Attach an evidence weight to every observed session.
 *
 * Sessions are newest-first (matching `load-history.ts`); contexts bind by
 * `sessionId`, not by position, and a session with no context row is simply
 * "never asked" — weight 1.00, not an exclusion.
 *
 * Weights are resolved oldest-first so each session's floors are judged against
 * a baseline built only from the sessions that preceded it — no circularity.
 */
export function weighSessions(
  observations: SessionObservation[],
  contexts: SessionContext[],
): WeightedSession[] {
  const contextById = new Map(contexts.map((context) => [context.sessionId, context]));

  const resolved: WeightedSession[] = [];

  // Walk oldest → newest.
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const observation = observations[index];
    const context = contextById.get(observation.sessionId) ?? emptyContext(observation.sessionId);

    const base = baseEvidenceWeight(context.readiness);

    // `resolved` currently holds the already-weighted older sessions, newest of
    // those first — i.e. exactly this session's history.
    const older = resolved.slice(0, INTERPRETATION_WINDOW);
    const baseline = weightedMean(
      older
        .filter((row) => row.observation.bestE1rm > 0)
        .map((row) => ({ weight: row.evidenceWeight, value: row.observation.bestE1rm })),
    );

    let floor: WeightFloor | null = null;
    let weight = base;

    // 1. Large-drop floor — a big drop on a Very Low day is still a big drop.
    const isLargeDrop =
      baseline > 0 &&
      observation.bestE1rm > 0 &&
      1 - observation.bestE1rm / baseline >= LARGE_DROP_E1RM_THRESHOLD;

    if (isLargeDrop && LARGE_DROP_WEIGHT_FLOOR > weight) {
      weight = LARGE_DROP_WEIGHT_FLOOR;
      floor = 'large_drop';
    }

    // 2. Repeat-decline floor — repeated low-readiness underperformance is a
    //    signal, not noise to be discounted twice.
    if (floor === null) {
      const previous = resolved[0];
      const beforePrevious = resolved[1];

      const declinedNow =
        previous !== undefined &&
        previous.observation.bestE1rm > 0 &&
        observation.bestE1rm < previous.observation.bestE1rm;

      const previousDeclined =
        beforePrevious !== undefined &&
        beforePrevious.observation.bestE1rm > 0 &&
        previous !== undefined &&
        previous.observation.bestE1rm < beforePrevious.observation.bestE1rm;

      const isRepeatDecline =
        declinedNow &&
        previousDeclined &&
        isLowReadiness(context.readiness) &&
        isLowReadiness(previous.context.readiness);

      if (isRepeatDecline && REPEAT_DECLINE_WEIGHT_FLOOR > weight) {
        weight = REPEAT_DECLINE_WEIGHT_FLOOR;
        floor = 'repeat_decline';
      }
    }

    resolved.unshift({ observation, context, evidenceWeight: weight, weightFloorApplied: floor });
  }

  return resolved;
}

// ── Trend + progression confidence (§3.2, §6.1) ──────────────────────────────

function detectDirection(window: WeightedSession[]): TrendDirection {
  // A session with no e1RM — cardio, a timed hold, a bodyweight movement at +0kg
  // — is not evidence of a trend in either direction. The engine's `detectTrend`
  // drops these (`a.e1rm > 0`) before any comparison; so do we, rather than
  // averaging a structural zero in as though it were a catastrophic session.
  const scored = window.filter((row) => row.observation.bestE1rm > 0);
  if (scored.length < 2) return 'stable';

  const e1rms = scored.map((row) => row.observation.bestE1rm);
  const latest = e1rms[0];

  // Consecutive down-run from the newest session: pair (i, i+1) trends down when
  // the newer entry is below the older one.
  let run = 0;
  while (run < e1rms.length - 1 && e1rms[run] < e1rms[run + 1]) run += 1;

  const peak = Math.max(...e1rms);
  const dropFromPeak = peak > 0 ? (peak - latest) / peak : 0;

  // Two independent routes to a sharp decline, exactly as the engine has today:
  // three consecutive declines, or a slow drift 15%+ below the window peak.
  if (run >= 3 || dropFromPeak >= E1RM_SHARP_DECLINE_FROM_PEAK) return 'sharp_decline';

  // A decline needs at least two consecutive down sessions, and the cumulative
  // drop across the run must clear the noise floor. One down session is noise.
  if (run >= 2) {
    const oldestInRun = e1rms[run];
    if (oldestInRun > 0 && (oldestInRun - latest) / oldestInRun >= E1RM_MEANINGFUL_DECLINE) {
      return 'declining';
    }
  }

  const priorBaseline = weightedMean(
    scored.slice(1).map((row) => ({ weight: row.evidenceWeight, value: row.observation.bestE1rm })),
  );
  if (priorBaseline > 0 && latest >= priorBaseline * (1 + E1RM_IMPROVING_BAND)) return 'improving';

  return 'stable';
}

function countCleanQualifyingRun(window: WeightedSession[]): number {
  let run = 0;
  for (const row of window) {
    if (!row.observation.allSetsAtCeiling || row.observation.completedWorkingSetCount === 0) break;
    run += 1;
  }
  return run;
}

function signal(key: ProgressionSignalKey, raw: number | null, neutral: number): SignalBreakdown {
  const weight = CONFIDENCE_COEFFICIENTS[key];
  return { key, raw, weight, contribution: weight * (raw ?? neutral) };
}

/**
 * Weighted baselines, trend direction, and progression confidence.
 *
 * Confidence is the plain sum of its named contributions — there is no hidden
 * term, no opaque score, and no model call. Phase is *not* a parameter: it gates
 * this number at prescription time, it never moves it (§4).
 */
export function assessTrend(weighted: WeightedSession[], repRange: RepRange): TrendAssessment {
  const window = weighted.slice(0, INTERPRETATION_WINDOW);
  const latest = window[0];
  const prior = window[1];

  // Sessions carrying no e1RM / no load contribute no evidence to that baseline.
  // A bodyweight movement at +0kg is not a 0kg lift, and averaging its zero in
  // would drag the baseline the §5 prescription is built on.
  const weightedBaselineE1rm = weightedMean(
    window
      .filter((row) => row.observation.bestE1rm > 0)
      .map((row) => ({ weight: row.evidenceWeight, value: row.observation.bestE1rm })),
  );
  const weightedBaselineLoad = weightedMean(
    window
      .filter((row) => row.observation.topLoad > 0)
      .map((row) => ({ weight: row.evidenceWeight, value: row.observation.topLoad })),
  );

  // Nothing logged yet — every signal is absent and confidence is 0. There is no
  // evidence to be neutral about.
  if (!latest) {
    const signals = (Object.keys(CONFIDENCE_COEFFICIENTS) as ProgressionSignalKey[]).map((key) => ({
      key,
      raw: null,
      weight: CONFIDENCE_COEFFICIENTS[key],
      contribution: 0,
    }));
    return {
      direction: 'stable',
      weightedBaselineE1rm,
      weightedBaselineLoad,
      cleanQualifyingRun: 0,
      progressionConfidence: 0,
      signals,
    };
  }

  const direction = detectDirection(window);

  const priorFraction = prior ? ceilingFraction(prior.observation, repRange) : null;
  const repeatEvidence =
    priorFraction === null
      ? REPEAT_EVIDENCE_NONE
      : priorFraction >= 1
        ? REPEAT_EVIDENCE_FULL
        : priorFraction > 0
          ? REPEAT_EVIDENCE_PARTIAL
          : REPEAT_EVIDENCE_NONE;

  const rir = latest.observation.finalWorkingSetRir;
  const readiness = latest.context.readiness;

  const signals: SignalBreakdown[] = [
    signal('ceiling_evidence', clamp01(ceilingFraction(latest.observation, repRange)), 0),
    signal('trend_component', TREND_COMPONENT[direction], 0),
    signal('repeat_evidence', repeatEvidence, 0),
    signal(
      'effort_headroom',
      rir === null ? null : EFFORT_HEADROOM_BY_RIR[rir],
      NEUTRAL_EFFORT_HEADROOM,
    ),
    signal(
      'readiness_context',
      readiness === null ? null : READINESS_CONTEXT[readiness],
      NEUTRAL_READINESS_CONTEXT,
    ),
  ];

  return {
    direction,
    weightedBaselineE1rm,
    weightedBaselineLoad,
    cleanQualifyingRun: countCleanQualifyingRun(window),
    progressionConfidence: signals.reduce((total, row) => total + row.contribution, 0),
    signals,
  };
}
