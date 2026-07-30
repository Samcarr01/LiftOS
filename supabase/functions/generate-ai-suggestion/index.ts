// @ts-nocheck — Deno runtime; imports via esm.sh / npm: specifier
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'npm:openai';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lift-os.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Internal types ─────────────────────────────────────────────────────────────

type ProgressionOutcome = 'progress' | 'hold' | 'deload' | 'plateau_detected' | 'insufficient_evidence';

interface SetData {
  values:       Record<string, number | null>;
  set_type:     string;
  is_completed: boolean;
}

interface SessionData {
  started_at:       string;
  sets:             SetData[];
  allSetsCompleted: boolean;
}

interface SuggestionTarget {
  weight?:       number;
  added_weight?: number;
  reps?:         number;
  laps?:         number;
  duration?:     number;
  distance?:     number;
  rationale:     string;
}

interface AISuggestion {
  primary:                  SuggestionTarget;
  alternative:              SuggestionTarget | null;
  outcome:                  ProgressionOutcome;
  reason:                   string;
  plateau_flag:             boolean;
  plateau_intervention:     string | undefined;
  plateau_sessions_stalled: number | undefined;
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateTarget(obj: unknown): SuggestionTarget | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const t = obj as Record<string, unknown>;

  const weight = typeof t.weight === 'number' && t.weight > 0 ? t.weight : undefined;
  const addedWeight =
    typeof t.added_weight === 'number' && t.added_weight > 0 ? t.added_weight : undefined;
  const reps = typeof t.reps === 'number' && t.reps > 0 ? Math.round(t.reps) : undefined;
  const laps = typeof t.laps === 'number' && t.laps > 0 ? Math.round(t.laps) : undefined;
  const duration = typeof t.duration === 'number' && t.duration > 0 ? t.duration : undefined;
  const distance = typeof t.distance === 'number' && t.distance > 0 ? t.distance : undefined;

  const hasValue =
    weight !== undefined ||
    addedWeight !== undefined ||
    reps !== undefined ||
    laps !== undefined ||
    duration !== undefined ||
    distance !== undefined;
  if (!hasValue) return null;

  const rationale = typeof t.rationale === 'string'
    ? t.rationale.slice(0, 200)
    : 'Based on recent performance.';

  return {
    weight,
    added_weight: addedWeight,
    reps,
    laps,
    duration,
    distance,
    rationale,
  };
}

function validateSuggestion(raw: unknown): AISuggestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;

  const primary = validateTarget(s.primary);
  if (!primary) return null;

  const outcome: ProgressionOutcome =
    ['progress', 'hold', 'deload', 'plateau_detected', 'insufficient_evidence'].includes(s.outcome as string)
      ? (s.outcome as ProgressionOutcome)
      : 'hold';

  const reason = typeof s.reason === 'string' ? s.reason.slice(0, 300) : '';

  return {
    primary,
    alternative:              s.alternative ? (validateTarget(s.alternative) ?? null) : null,
    outcome,
    reason,
    plateau_flag:             typeof s.plateau_flag === 'boolean' ? s.plateau_flag : false,
    plateau_intervention:     undefined,
    plateau_sessions_stalled: undefined,
  };
}

// ── Bounds ─────────────────────────────────────────────────────────────────────

interface ProgressBaseline {
  weight: number;
  addedWeight: number;
  reps: number;
  laps: number;
  duration: number;
  distance: number;
}

function roundQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

/** Round UP to nearest 0.25 — used for progression so weight never rounds back down. */
function roundQuarterUp(value: number): number {
  return Math.ceil(value * 4) / 4;
}

function applyBounds(
  suggestion: AISuggestion,
  baseline: ProgressBaseline,
): AISuggestion {
  const bound = (t: SuggestionTarget | null): SuggestionTarget | null => {
    if (!t) return null;
    const result = { ...t };
    // Max +5% weight, min -10% weight (allows deload), rounded to nearest 0.25 kg
    if (result.weight !== undefined && baseline.weight > 0) {
      result.weight = roundQuarter(Math.min(result.weight, baseline.weight * 1.05));
      result.weight = Math.max(result.weight, baseline.weight * 0.90);
    }
    if (result.added_weight !== undefined && baseline.addedWeight > 0) {
      result.added_weight = roundQuarter(
        Math.min(result.added_weight, baseline.addedWeight * 1.05),
      );
      result.added_weight = Math.max(result.added_weight, baseline.addedWeight * 0.90);
    }
    // Max +2 reps, min -2 reps (allows reduction for deload)
    if (result.reps !== undefined && baseline.reps > 0) {
      result.reps = Math.min(result.reps, baseline.reps + 2);
      result.reps = Math.max(result.reps, Math.max(1, Math.round(baseline.reps - 2)));
    }
    if (result.laps !== undefined && baseline.laps > 0) {
      result.laps = Math.min(result.laps, baseline.laps + 2);
      result.laps = Math.max(result.laps, Math.max(1, Math.round(baseline.laps - 2)));
    }
    if (result.duration !== undefined && baseline.duration > 0) {
      result.duration = Math.max(result.duration, Math.round(baseline.duration * 0.85));
    }
    if (result.distance !== undefined && baseline.distance > 0) {
      result.distance = Math.max(result.distance, Math.round(baseline.distance * 0.90));
    }
    return result;
  };

  return {
    ...suggestion,
    primary:     bound(suggestion.primary)!,
    alternative: bound(suggestion.alternative),
  };
}

// ── Deterministic progression engine ──────────────────────────────────────────

/**
 * Evaluate progression outcome based on available data.
 *
 * Outcome logic:
 *   insufficient_evidence  – < 2 sessions logged for this exercise
 *   deload                 – 14+ day gap since last session (return from break)
 *   plateau_detected       – 3+ consecutive stalled sessions (e1RM not improving)
 *   progress               – All sets completed, consistent reps, no fatigue signals
 *   hold                   – Incomplete sets, rep drop-off, or RIR <= 1 (near failure)
 *
 * When RIR is available (rir field in set values):
 *   RIR 0-1  → near failure, hold or deload
 *   RIR 2    → moderate effort, hold
 *   RIR 3+   → more in the tank, progress confidently
 *   Missing  → neutral, rely on other signals
 */
function deterministicProgression(sessions: SessionData[], schema: unknown, plateau: PlateauResult): AISuggestion {
  const keys = getSchemaKeys(schema);
  const hasWeight = keys.includes('weight');
  const hasAddedWeight = keys.includes('added_weight');
  const hasReps = keys.includes('reps');
  const hasLaps = keys.includes('laps');
  const hasDuration = keys.includes('duration');
  const hasDistance = keys.includes('distance');
  const hasRir = keys.includes('rir');

  // ── insufficient_evidence: fewer than 2 sessions ──────────────────────────
  if (sessions.length < 2) {
    return starterSuggestion(keys, hasWeight, hasAddedWeight, hasReps, hasLaps, hasDuration, hasDistance);
  }

  const latest = sessions[0];
  const workingSets = getWorkingSets(latest);
  const daysSinceLastSession = daysBetween(new Date(latest.started_at), new Date());

  // ── deload: 14+ day gap ──────────────────────────────────────────────────
  if (daysSinceLastSession >= 14) {
    return deloadSuggestion(workingSets, keys, hasWeight, hasAddedWeight, hasReps, hasLaps, hasDuration, hasDistance, daysSinceLastSession);
  }

  // ── plateau_detected: use server-computed plateau ─────────────────────────
  if (plateau.is_plateau) {
    return plateauSuggestion(workingSets, keys, hasWeight, hasAddedWeight, hasReps, hasLaps, hasDuration, hasDistance, plateau);
  }

  // ── Evaluate latest session signals ───────────────────────────────────────
  if (workingSets.length === 0) {
    return {
      primary: { rationale: 'Complete some sets this session to unlock your next target.' },
      alternative: null,
      outcome: 'insufficient_evidence',
      reason: 'No working sets completed in the latest session.',
      plateau_flag: false,
    };
  }

  // Extract RIR values if available
  const rirValues = workingSets
    .map((s) => Number(s.values.rir ?? -1))
    .filter((r) => r >= 0);
  const avgRir = rirValues.length > 0 ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length : -1;
  const minRir = rirValues.length > 0 ? Math.min(...rirValues) : -1;

  // Extract rep values for consistency check
  const repValues = workingSets
    .map((s) => Number(s.values.reps ?? 0))
    .filter((r) => r > 0);
  const hasRepDropoff = repValues.length >= 3 && repValues[0] > repValues[repValues.length - 1];
  const repConsistency = repValues.length >= 2
    ? Math.max(...repValues) - Math.min(...repValues)
    : 0;

  // Check for 3+ consecutive stalled sessions at same weight
  const stalledCount = countStalledSessions(sessions, keys);
  if (stalledCount >= 3) {
    return plateauSuggestion(workingSets, keys, hasWeight, hasAddedWeight, hasReps, hasLaps, hasDuration, hasDistance, {
      is_plateau: true,
      stalled: stalledCount,
      intervention: `No progress for ${stalledCount} sessions. Try a deload week or change rep scheme.`,
    });
  }

  // ── Decision tree ─────────────────────────────────────────────────────────
  if (hasWeight && hasReps) {
    return weightRepsDecision(workingSets, latest, hasRir, avgRir, minRir, hasRepDropoff, repConsistency, stalledCount, daysSinceLastSession);
  }

  if (hasWeight && hasLaps) {
    return weightLapsDecision(workingSets, latest, hasRir, avgRir, minRir, stalledCount, daysSinceLastSession);
  }

  if (hasAddedWeight && hasReps) {
    return addedWeightRepsDecision(workingSets, latest, hasRir, avgRir, minRir, hasRepDropoff, repConsistency, stalledCount, daysSinceLastSession);
  }

  if (hasLaps) {
    return lapsDecision(workingSets, latest, hasRir, avgRir, minRir, stalledCount, daysSinceLastSession);
  }

  if (hasDistance && hasDuration) {
    return distanceDurationDecision(workingSets, latest, stalledCount, daysSinceLastSession);
  }

  if (hasDistance) {
    return distanceDecision(workingSets, latest, stalledCount, daysSinceLastSession);
  }

  if (hasDuration) {
    return durationDecision(workingSets, latest, stalledCount, daysSinceLastSession);
  }

  if (hasReps) {
    return repsDecision(workingSets, latest, hasRir, avgRir, minRir, stalledCount, daysSinceLastSession);
  }

  return {
    primary: { rationale: 'Log one full session for this exercise to unlock a better target.' },
    alternative: null,
    outcome: 'insufficient_evidence',
    reason: 'Not enough data to compute a meaningful progression target.',
    plateau_flag: false,
  };
}

// ── Decision helpers ──────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function countStalledSessions(sessions: SessionData[], keys: string[]): number {
  const hasWeight = keys.includes('weight');
  const hasAddedWeight = keys.includes('added_weight');
  if (!hasWeight && !hasAddedWeight) return 0;

  const e1RMs = sessions.map((s) => sessionE1RM(s));
  let stalled = 0;
  const reference = e1RMs[0]; // most recent
  for (let i = 1; i < sessions.length; i++) {
    if (e1RMs[i] >= reference) stalled++;
    else break;
  }
  return stalled;
}

function getBestWeight(workingSets: SetData[]): number {
  return Math.max(...workingSets.map((s) => Number(s.values.weight ?? 0)));
}

function getBestAddedWeight(workingSets: SetData[]): number {
  return Math.max(...workingSets.map((s) => Number(s.values.added_weight ?? 0)));
}

function getTopSetValues(workingSets: SetData[], key: string): { value: number; reps: number } {
  const values = workingSets.map((s) => Number(s.values[key] ?? 0));
  const maxVal = Math.max(...values);
  const topSet = workingSets.find((s) => Number(s.values[key]) === maxVal);
  return {
    value: maxVal,
    reps: Number(topSet?.values.reps ?? 0),
  };
}

function buildRirContext(avgRir: number, minRir: number, hasRir: boolean): string {
  if (!hasRir) return '';
  if (minRir <= 1) return ` RIR ${minRir} across sets — near failure.`;
  if (avgRir >= 3) return ` RIR ${Math.round(avgRir)} on average — more in the tank.`;
  return ` RIR ${Math.round(avgRir)} — moderate effort.`;
}

// ── Starter suggestions (insufficient_evidence) ───────────────────────────────

function starterSuggestion(
  keys: string[], hasWeight: boolean, hasAddedWeight: boolean,
  hasReps: boolean, hasLaps: boolean, hasDuration: boolean, hasDistance: boolean,
): AISuggestion {
  const base: AISuggestion = {
    primary: { reps: 8, rationale: 'No history yet. Start with a comfortable target and log your first session.' },
    alternative: null,
    outcome: 'insufficient_evidence',
    reason: 'Fewer than 2 logged sessions for this exercise.',
    plateau_flag: false,
  };

  if (hasWeight && hasLaps) {
    return {
      ...base,
      primary: { laps: 4, rationale: 'No history yet. Start with a manageable load for 4 laps.' },
      reason: 'Not enough history to determine progression. Start with a baseline.',
    };
  }
  if (hasLaps) {
    return {
      ...base,
      primary: { laps: 4, rationale: 'No history yet. Start with a lap target you can finish cleanly.' },
      reason: 'Not enough history to determine progression. Start with a baseline.',
    };
  }
  if (hasDuration && !hasDistance) {
    return {
      ...base,
      primary: { duration: 30, rationale: 'No history yet. Start with a clean 30-second effort.' },
      reason: 'Not enough history to determine progression. Start with a baseline.',
    };
  }
  if (hasDistance) {
    return {
      ...base,
      primary: { distance: 500, rationale: 'No history yet. Start with a moderate distance and log the result.' },
      reason: 'Not enough history to determine progression. Start with a baseline.',
    };
  }
  return base;
}

// ── Deload suggestion ─────────────────────────────────────────────────────────

function deloadSuggestion(
  workingSets: SetData[], keys: string[],
  hasWeight: boolean, hasAddedWeight: boolean, hasReps: boolean, hasLaps: boolean,
  hasDuration: boolean, hasDistance: boolean, daysGap: number,
): AISuggestion {
  const weight = hasWeight ? getBestWeight(workingSets) : 0;
  const addedWeight = hasAddedWeight ? getBestAddedWeight(workingSets) : 0;
  const reps = hasReps ? Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0))) : 0;
  const laps = hasLaps ? Math.max(...workingSets.map((s) => Number(s.values.laps ?? 0))) : 0;
  const duration = hasDuration ? Math.max(...workingSets.map((s) => Number(s.values.duration ?? 0))) : 0;
  const distance = hasDistance ? Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0))) : 0;

  const target: SuggestionTarget = { rationale: '' };
  if (hasWeight && hasReps) {
    const deloadWeight = roundQuarter(weight * 0.90);
    const deloadReps = Math.max(1, Math.round(reps * 0.85));
    target.weight = deloadWeight;
    target.reps = deloadReps;
    target.rationale = `${daysGap} days since last session. Deload to ${deloadWeight}kg × ${deloadReps} reps and ease back in.`;
  } else if (hasWeight && hasLaps) {
    const deloadWeight = roundQuarter(weight * 0.90);
    target.weight = deloadWeight;
    target.laps = laps;
    target.rationale = `${daysGap} days since last session. Reduce load to ${deloadWeight}kg and re-acclimate.`;
  } else if (hasAddedWeight && hasReps) {
    const deloadAdded = roundQuarter(addedWeight * 0.85);
    target.added_weight = deloadAdded;
    target.reps = Math.max(1, Math.round(reps * 0.85));
    target.rationale = `${daysGap} days since last session. Drop added load to ${deloadAdded}kg and ease back in.`;
  } else if (hasReps) {
    const deloadReps = Math.max(1, Math.round(reps * 0.85));
    target.reps = deloadReps;
    target.rationale = `${daysGap} days since last session. Reduce reps to ${deloadReps} and focus on form.`;
  } else if (hasDistance) {
    target.distance = Math.round(distance * 0.90);
    target.rationale = `${daysGap} days since last session. Reduce distance to ${target.distance}m and rebuild.`;
  } else if (hasDuration) {
    target.duration = Math.round(duration * 0.85);
    target.rationale = `${daysGap} days since last session. Reduce duration to ${target.duration}s.`;
  } else {
    target.rationale = `${daysGap} days since last session. Take it easy and match previous effort.`;
  }

  return {
    primary: target,
    alternative: null,
    outcome: 'deload',
    reason: `${daysGap} days since last session. Recommending a deload to re-acclimate safely.`,
    plateau_flag: false,
  };
}

// ── Plateau suggestion ────────────────────────────────────────────────────────

function plateauSuggestion(
  workingSets: SetData[], keys: string[],
  hasWeight: boolean, hasAddedWeight: boolean, hasReps: boolean, hasLaps: boolean,
  hasDuration: boolean, hasDistance: boolean, plateau: PlateauResult,
): AISuggestion {
  const weight = hasWeight ? getBestWeight(workingSets) : 0;
  const addedWeight = hasAddedWeight ? getBestAddedWeight(workingSets) : 0;
  const reps = hasReps ? Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0))) : 0;
  const laps = hasLaps ? Math.max(...workingSets.map((s) => Number(s.values.laps ?? 0))) : 0;
  const duration = hasDuration ? Math.max(...workingSets.map((s) => Number(s.values.duration ?? 0))) : 0;
  const distance = hasDistance ? Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0))) : 0;

  const target: SuggestionTarget = { rationale: '' };
  if (hasWeight && hasReps) {
    target.weight = weight;
    target.reps = reps;
    target.rationale = plateau.intervention ?? `Stalled for ${plateau.stalled} sessions at ${weight}kg. Hold and focus on technique.`;
  } else if (hasWeight && hasLaps) {
    target.weight = weight;
    target.laps = laps;
    target.rationale = plateau.intervention ?? `Stalled for ${plateau.stalled} sessions. Hold at ${weight}kg.`;
  } else if (hasAddedWeight && hasReps) {
    target.added_weight = addedWeight;
    target.reps = reps;
    target.rationale = plateau.intervention ?? `No progress for ${plateau.stalled} sessions. Hold the current target.`;
  } else {
    target.rationale = plateau.intervention ?? `Stalled for ${plateau.stalled} sessions. Hold and focus on quality.`;
  }

  return {
    primary: target,
    alternative: null,
    outcome: 'plateau_detected',
    reason: `Estimated 1RM has not improved for ${plateau.stalled} consecutive sessions.`,
    plateau_flag: true,
    plateau_intervention: plateau.intervention,
    plateau_sessions_stalled: plateau.stalled,
  };
}

// ── Weight + reps decision ────────────────────────────────────────────────────

function weightRepsDecision(
  workingSets: SetData[], latest: SessionData,
  hasRir: boolean, avgRir: number, minRir: number,
  hasRepDropoff: boolean, repConsistency: number,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const bestWeight = getBestWeight(workingSets);
  const topSet = workingSets.find((s) => Number(s.values.weight) === bestWeight);
  const lastReps = Number(topSet?.values.reps ?? 0);
  const rirCtx = buildRirContext(avgRir, minRir, hasRir);

  // RIR 0-1 → near failure, hold
  if (hasRir && minRir <= 1) {
    return {
      primary: {
        weight: bestWeight,
        reps: lastReps,
        rationale: `Near failure on last set (RIR ${minRir}).${rirCtx} Repeat ${bestWeight}kg × ${lastReps} and aim for cleaner reps.`,
      },
      alternative: null,
      outcome: 'hold',
      reason: `RIR ${minRir} indicates near-maximal effort. Hold current weight to accumulate volume.`,
      plateau_flag: false,
    };
  }

  // RIR 3+ → more in the tank, progress confidently
  if (hasRir && avgRir >= 3) {
    const nextWeight = incrementByPercent(bestWeight, 0.03, 1.25);
    return {
      primary: {
        weight: nextWeight,
        reps: lastReps,
        rationale: `RIR ${Math.round(avgRir)} on average — more in the tank.${rirCtx} Progress to ${nextWeight}kg.`,
      },
      alternative: {
        weight: bestWeight,
        reps: lastReps + 1,
        rationale: `Or keep ${bestWeight}kg and aim for ${lastReps + 1} reps.`,
      },
      outcome: 'progress',
      reason: `Average RIR ${Math.round(avgRir)} across sets. Sufficient capacity to increase load.`,
      plateau_flag: false,
    };
  }

  // All sets completed + consistent reps → progress
  if (latest.allSetsCompleted && !hasRepDropoff && repConsistency <= 1) {
    const nextWeight = incrementByPercent(bestWeight, 0.03, 1.25);
    return {
      primary: {
        weight: nextWeight,
        reps: lastReps,
        rationale: `All sets complete at ${bestWeight}kg.${rirCtx} Progress to ${nextWeight}kg.`,
      },
      alternative: {
        weight: bestWeight,
        reps: lastReps + 1,
        rationale: `Or squeeze out 1 more rep at ${bestWeight}kg.`,
      },
      outcome: 'progress',
      reason: `All sets completed cleanly at ${bestWeight}kg × ${lastReps}. Ready to progress.`,
      plateau_flag: false,
    };
  }

  // All sets completed but rep drop-off → hold (inconsistent)
  if (latest.allSetsCompleted && hasRepDropoff) {
    return {
      primary: {
        weight: bestWeight,
        reps: lastReps,
        rationale: `Reps dropped across sets (${repValues(workingSets).join(', ')}).${rirCtx} Repeat ${bestWeight}kg × ${lastReps} and build consistency.`,
      },
      alternative: null,
      outcome: 'hold',
      reason: `Reps dropped across sets, indicating fatigue. Hold weight and build rep consistency.`,
      plateau_flag: false,
    };
  }

  // Not all sets completed → hold
  return {
    primary: {
      weight: bestWeight,
      reps: lastReps,
      rationale: `Focus on completing all sets at ${bestWeight}kg × ${lastReps}.${rirCtx}`,
    },
    alternative: null,
    outcome: 'hold',
    reason: `Not all sets completed in the latest session. Need full completion before progressing.`,
    plateau_flag: false,
  };
}

function repValues(workingSets: SetData[]): number[] {
  return workingSets.map((s) => Number(s.values.reps ?? 0)).filter((r) => r > 0);
}

// ── Weight + laps decision ────────────────────────────────────────────────────

function weightLapsDecision(
  workingSets: SetData[], latest: SessionData,
  hasRir: boolean, avgRir: number, minRir: number,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const bestWeight = getBestWeight(workingSets);
  const topSet = workingSets.find((s) => Number(s.values.weight) === bestWeight);
  const lastLaps = Number(topSet?.values.laps ?? 0);
  const rirCtx = buildRirContext(avgRir, minRir, hasRir);

  if (hasRir && minRir <= 1) {
    return {
      primary: { weight: bestWeight, laps: lastLaps, rationale: `Near failure (RIR ${minRir}).${rirCtx} Repeat ${bestWeight}kg for ${lastLaps} laps.` },
      alternative: null,
      outcome: 'hold',
      reason: `RIR ${minRir} indicates near-maximal effort on loaded laps.`,
      plateau_flag: false,
    };
  }

  if (latest.allSetsCompleted) {
    const nextWeight = incrementByPercent(bestWeight, 0.03, 1.25);
    return {
      primary: {
        weight: nextWeight,
        laps: lastLaps,
        rationale: `You completed all loaded laps at ${bestWeight}kg.${rirCtx} Move to ${nextWeight}kg.`,
      },
      alternative: {
        weight: bestWeight,
        laps: lastLaps + 1,
        rationale: `Or keep ${bestWeight}kg and add 1 lap.`,
      },
      outcome: 'progress',
      reason: `All loaded laps completed at ${bestWeight}kg. Ready to increase load.`,
      plateau_flag: false,
    };
  }

  return {
    primary: {
      weight: bestWeight,
      laps: lastLaps,
      rationale: `Repeat ${bestWeight}kg for ${lastLaps} laps until every set feels solid.${rirCtx}`,
    },
    alternative: null,
    outcome: 'hold',
    reason: `Not all loaded laps completed. Build consistency before progressing.`,
    plateau_flag: false,
  };
}

// ── Added weight + reps decision ──────────────────────────────────────────────

function addedWeightRepsDecision(
  workingSets: SetData[], latest: SessionData,
  hasRir: boolean, avgRir: number, minRir: number,
  hasRepDropoff: boolean, repConsistency: number,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const bestAddedWeight = getBestAddedWeight(workingSets);
  const topSet = workingSets.find((s) => Number(s.values.added_weight ?? 0) === bestAddedWeight);
  const lastReps = Number(topSet?.values.reps ?? 0);
  const rirCtx = buildRirContext(avgRir, minRir, hasRir);

  if (hasRir && minRir <= 1) {
    return {
      primary: {
        added_weight: bestAddedWeight > 0 ? bestAddedWeight : undefined,
        reps: lastReps,
        rationale: `Near failure (RIR ${minRir}).${rirCtx} Repeat +${bestAddedWeight}kg × ${lastReps}.`,
      },
      alternative: null,
      outcome: 'hold',
      reason: `RIR ${minRir} indicates near-maximal effort. Hold current load.`,
      plateau_flag: false,
    };
  }

  if (latest.allSetsCompleted) {
    if (bestAddedWeight > 0) {
      const nextAddedWeight = incrementByPercent(bestAddedWeight, 0.03, 1.25);
      return {
        primary: {
          added_weight: nextAddedWeight,
          reps: lastReps,
          rationale: `You finished all sets at +${bestAddedWeight}kg.${rirCtx} Try +${nextAddedWeight}kg next.`,
        },
        alternative: {
          added_weight: bestAddedWeight,
          reps: lastReps + 1,
          rationale: `Or keep +${bestAddedWeight}kg and add 1 rep.`,
        },
        outcome: 'progress',
        reason: `All sets completed at +${bestAddedWeight}kg. Ready to increase load.`,
        plateau_flag: false,
      };
    }

    const maxReps = Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0)));
    return {
      primary: { reps: maxReps + 1, rationale: `You hit ${maxReps} reps.${rirCtx} Aim for ${maxReps + 1} next time.` },
      alternative: { added_weight: 1.25, reps: maxReps, rationale: 'Or add a small external load and keep reps steady.' },
      outcome: 'progress',
      reason: `All sets completed at ${maxReps} reps bodyweight. Ready to add reps or load.`,
      plateau_flag: false,
    };
  }

  return {
    primary: {
      added_weight: bestAddedWeight > 0 ? bestAddedWeight : undefined,
      reps: lastReps,
      rationale: bestAddedWeight > 0
        ? `Repeat +${bestAddedWeight}kg for ${lastReps} reps until every set is complete.${rirCtx}`
        : `Repeat ${lastReps} reps with bodyweight until every set is complete.${rirCtx}`,
    },
    alternative: null,
    outcome: 'hold',
    reason: 'Not all sets completed. Need full completion before progressing.',
    plateau_flag: false,
  };
}

// ── Laps-only decision ────────────────────────────────────────────────────────

function lapsDecision(
  workingSets: SetData[], latest: SessionData,
  hasRir: boolean, avgRir: number, minRir: number,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const maxLaps = Math.max(...workingSets.map((s) => Number(s.values.laps ?? 0)));
  const rirCtx = buildRirContext(avgRir, minRir, hasRir);

  if (hasRir && minRir <= 1) {
    return {
      primary: { laps: maxLaps, rationale: `Near failure (RIR ${minRir}).${rirCtx} Repeat ${maxLaps} laps.` },
      alternative: null,
      outcome: 'hold',
      reason: `RIR ${minRir} indicates near-maximal effort.`,
      plateau_flag: false,
    };
  }

  if (latest.allSetsCompleted) {
    return {
      primary: { laps: maxLaps + 1, rationale: `You completed ${maxLaps} laps.${rirCtx} Aim for ${maxLaps + 1}.` },
      alternative: { laps: maxLaps, rationale: 'Repeat the same lap count and make the effort cleaner.' },
      outcome: 'progress',
      reason: `All ${maxLaps} laps completed. Ready to add a lap.`,
      plateau_flag: false,
    };
  }

  return {
    primary: { laps: maxLaps, rationale: `Repeat ${maxLaps} laps until every set is complete.${rirCtx}` },
    alternative: null,
    outcome: 'hold',
    reason: 'Not all laps completed. Build consistency before progressing.',
    plateau_flag: false,
  };
}

// ── Distance + duration decision ──────────────────────────────────────────────

function distanceDurationDecision(
  workingSets: SetData[], latest: SessionData,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const bestDistance = Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0)));
  const fastestSet = workingSets
    .filter((s) => Number(s.values.distance ?? 0) === bestDistance)
    .sort((a, b) => Number(a.values.duration ?? Infinity) - Number(b.values.duration ?? Infinity))[0];
  const lastDuration = Number(fastestSet?.values.duration ?? 0);

  if (latest.allSetsCompleted) {
    return {
      primary: {
        distance: roundToStep(bestDistance * 1.05, 10),
        duration: lastDuration || undefined,
        rationale: `You covered ${bestDistance}m. Add a small distance bump next time.`,
      },
      alternative: {
        distance: bestDistance,
        duration: lastDuration || undefined,
        rationale: 'Keep the same target and make the whole effort feel cleaner.',
      },
      outcome: 'progress',
      reason: `All distance sets completed at ${bestDistance}m. Ready to increase distance.`,
      plateau_flag: false,
    };
  }

  return {
    primary: {
      distance: bestDistance,
      duration: lastDuration || undefined,
      rationale: `Repeat ${bestDistance}m until you can complete every set consistently.`,
    },
    alternative: null,
    outcome: 'hold',
    reason: 'Not all distance sets completed. Build consistency before progressing.',
    plateau_flag: false,
  };
}

// ── Distance-only decision ────────────────────────────────────────────────────

function distanceDecision(
  workingSets: SetData[], latest: SessionData,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const bestDistance = Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0)));

  if (latest.allSetsCompleted) {
    return {
      primary: { distance: roundToStep(bestDistance * 1.05, 10), rationale: `You hit ${bestDistance}m. Add a little more distance next time.` },
      alternative: { distance: bestDistance, rationale: 'Repeat the same distance and make it feel easier.' },
      outcome: 'progress',
      reason: `All sets completed at ${bestDistance}m. Ready to increase distance.`,
      plateau_flag: false,
    };
  }

  return {
    primary: { distance: bestDistance, rationale: `Repeat ${bestDistance}m until every set is complete.` },
    alternative: null,
    outcome: 'hold',
    reason: 'Not all sets completed. Build consistency before progressing.',
    plateau_flag: false,
  };
}

// ── Duration-only decision ────────────────────────────────────────────────────

function durationDecision(
  workingSets: SetData[], latest: SessionData,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const bestDuration = Math.max(...workingSets.map((s) => Number(s.values.duration ?? 0)));

  if (latest.allSetsCompleted) {
    return {
      primary: { duration: bestDuration + 5, rationale: `You held for ${bestDuration} seconds. Add 5 seconds next time.` },
      alternative: { duration: bestDuration, rationale: 'Repeat the same duration with cleaner form.' },
      outcome: 'progress',
      reason: `All sets completed at ${bestDuration}s. Ready to increase duration.`,
      plateau_flag: false,
    };
  }

  return {
    primary: { duration: bestDuration, rationale: `Repeat ${bestDuration} seconds until every set is complete.` },
    alternative: null,
    outcome: 'hold',
    reason: 'Not all sets completed. Build consistency before progressing.',
    plateau_flag: false,
  };
}

// ── Reps-only decision ────────────────────────────────────────────────────────

function repsDecision(
  workingSets: SetData[], latest: SessionData,
  hasRir: boolean, avgRir: number, minRir: number,
  stalledCount: number, daysGap: number,
): AISuggestion {
  const maxReps = Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0)));
  const rirCtx = buildRirContext(avgRir, minRir, hasRir);

  if (hasRir && minRir <= 1) {
    return {
      primary: { reps: maxReps, rationale: `Near failure (RIR ${minRir}).${rirCtx} Repeat ${maxReps} reps.` },
      alternative: null,
      outcome: 'hold',
      reason: `RIR ${minRir} indicates near-maximal effort.`,
      plateau_flag: false,
    };
  }

  if (latest.allSetsCompleted) {
    return {
      primary: { reps: maxReps + 1, rationale: `You hit ${maxReps} reps last session.${rirCtx} Aim for ${maxReps + 1}.` },
      alternative: { reps: maxReps, rationale: 'Maintain reps with sharper form.' },
      outcome: 'progress',
      reason: `All sets completed at ${maxReps} reps. Ready to increase reps.`,
      plateau_flag: false,
    };
  }

  return {
    primary: { reps: maxReps, rationale: `Repeat ${maxReps} reps until every set is complete.${rirCtx}` },
    alternative: null,
    outcome: 'hold',
    reason: 'Not all sets completed. Build consistency before progressing.',
    plateau_flag: false,
  };
}

// ── Plateau detection (template-based, no AI call) ────────────────────────────

interface PlateauResult {
  is_plateau:   boolean;
  stalled:      number;
  intervention: string | undefined;
}

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function sessionE1RM(session: SessionData): number {
  const working = getWorkingSets(session);
  if (working.length === 0) return 0;
  const bestLoad = Math.max(...working.map((s) =>
    Number(s.values.weight ?? s.values.added_weight ?? 0),
  ));
  if (bestLoad <= 0) return 0;
  const topSet = working.find((s) =>
    Number(s.values.weight ?? s.values.added_weight ?? 0) === bestLoad,
  );
  const reps   = Number(topSet?.values.reps ?? 0);
  return reps > 0 ? epley(bestLoad, reps) : 0;
}

/**
 * Detect whether the user is plateauing.
 * Requires >= 4 sessions (newest-first). Compares max recent e1RM vs reference.
 */
function computePlateau(sessions: SessionData[]): PlateauResult {
  if (sessions.length < 4) {
    return { is_plateau: false, stalled: 0, intervention: undefined };
  }

  // sessions[0] = most recent; sessions[N-1] = oldest in window
  const e1RMs = sessions.map(sessionE1RM);

  // Reference: the oldest available session (up to index 3)
  const referenceIdx = Math.min(sessions.length - 1, 3);
  const reference    = e1RMs[referenceIdx];

  if (reference <= 0) {
    return { is_plateau: false, stalled: 0, intervention: undefined };
  }

  // Count consecutive stalled sessions from most recent outward
  let stalled = 0;
  for (let i = 0; i < referenceIdx; i++) {
    if (e1RMs[i] <= reference) stalled++;
    else break; // improvement found → streak broken
  }

  if (stalled < 2) {
    return { is_plateau: false, stalled, intervention: undefined };
  }

  let intervention: string;
  if (stalled <= 3) {
    intervention = 'Hold the same target next session and try to complete every set cleanly before you increase again.';
  } else if (stalled <= 5) {
    intervention = 'Keep the same load and push progression through one extra rep or one extra completed set before raising it.';
  } else {
    intervention = 'Stay at the same target for a week or two, lock in cleaner execution, then resume micro-progressing.';
  }

  return { is_plateau: true, stalled, intervention };
}

// ── Tracking-type label for AI prompt ─────────────────────────────────────────

function trackingTypeLabel(schema: unknown): string {
  const keys = getSchemaKeys(schema);
  if (keys.includes('weight') && keys.includes('reps')) return 'weight + reps';
  if (keys.includes('weight') && keys.includes('laps')) return 'weight + laps';
  if (keys.includes('added_weight') && keys.includes('reps')) return 'bodyweight reps with optional added load';
  if (keys.includes('reps')) return 'reps only';
  if (keys.includes('laps')) return 'laps';
  if (keys.includes('distance') && keys.includes('duration')) return 'distance + time';
  if (keys.includes('duration')) return 'time/duration';
  if (keys.includes('distance')) return 'distance';
  return 'custom fields';
}

// ── Upsert helper (delete-then-insert; no UNIQUE constraint on table) ──────────

async function storeSuggestion(
  supabase:   ReturnType<typeof createClient>,
  userId:     string,
  exerciseId: string,
  suggestion: AISuggestion,
  source:     string,
): Promise<void> {
  // Remove existing suggestions for this user+exercise before inserting fresh
  await supabase
    .from('ai_suggestions')
    .delete()
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day cache

  await supabase.from('ai_suggestions').insert({
    user_id:          userId,
    exercise_id:      exerciseId,
    suggestion_data:  suggestion,
    history_snapshot: { source, generated_at: new Date().toISOString() },
    model_version:    source === 'ai' ? 'gpt-4o' : 'rule-based',
    expires_at:       expiresAt.toISOString(),
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Authenticate the calling user ───────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const userId = user.id;

    // ── Pro entitlement check (DB, not JWT — canonical source of truth) ────────
    const { data: userProfile } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', userId)
      .single();
    const isPro = userProfile?.subscription_tier === 'pro';

    const body = await req.json().catch(() => ({}));
    const { exercise_id: exerciseId } = body as Record<string, string>;

    if (!exerciseId) {
      return json({ error: 'exercise_id required' }, 400);
    }

    // Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(exerciseId)) {
      return json({ error: 'Invalid exercise_id format' }, 400);
    }

    // Service-role client for data operations (writes to ai_suggestions etc.)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Fetch exercise (must belong to this user) ────────────────────────────
    const { data: exercise, error: exErr } = await supabase
      .from('exercises')
      .select('id, name, tracking_schema')
      .eq('id', exerciseId)
      .eq('user_id', userId)
      .single();

    if (exErr || !exercise) return json({ error: 'Exercise not found' }, 404);

    // ── Fetch session history (last 5 sessions for this user + exercise) ─────
    // Step 1: last 20 completed sessions for this user (newest first)
    const { data: userSessions } = await supabase
      .from('workout_sessions')
      .select('id, started_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(20);

    const sessionIds    = (userSessions ?? []).map((s: { id: string }) => s.id);
    const sessionDates  = new Map<string, string>(
      (userSessions ?? []).map((s: { id: string; started_at: string }) => [s.id, s.started_at]),
    );

    // Step 2: session_exercises for this exercise in those sessions
    const { data: seRows } = sessionIds.length
      ? await supabase
          .from('session_exercises')
          .select('session_id, set_entries ( values, set_type, is_completed )')
          .eq('exercise_id', exerciseId)
          .in('session_id', sessionIds)
      : { data: [] };

    // Build SessionData[] sorted newest-first, take up to 5
    const sessions: SessionData[] = (seRows ?? [])
      .filter((se: { session_id: string }) => sessionDates.has(se.session_id))
      .sort((a: { session_id: string }, b: { session_id: string }) =>
        (sessionDates.get(b.session_id) ?? '').localeCompare(sessionDates.get(a.session_id) ?? ''),
      )
      .slice(0, 5)
      .map((se: { session_id: string; set_entries: SetData[] }) => {
        const allSets: SetData[] = (se.set_entries ?? []).map((s) => ({
          values:       s.values as Record<string, number | null>,
          set_type:     s.set_type,
          is_completed: s.is_completed,
        }));
        const working        = allSets.filter((s) => s.set_type === 'working' || s.set_type === 'top');
        const completedCount = working.filter((s) => s.is_completed).length;
        return {
          started_at:       sessionDates.get(se.session_id) ?? '',
          sets:             allSets,
          allSetsCompleted: working.length > 0 && completedCount === working.length,
        };
      });

    const trackingType = trackingTypeLabel(exercise.tracking_schema);

    // Extract last session values for AI suggestion bounds (allows -10% to +5%).
    const latestWorking = sessions.length > 0 ? getWorkingSets(sessions[0]) : [];
    const baseline = buildProgressBaseline(latestWorking, exercise.tracking_schema);

    // ── Compute plateau (always — uses same session data, no extra query) ────
    const plateau = computePlateau(sessions);

    // ── < 2 sessions: deterministic only ────────────────────────────────────
    if (sessions.length < 2) {
      const suggestion = deterministicProgression(sessions, exercise.tracking_schema, plateau);
      await storeSuggestion(supabase, userId, exerciseId, suggestion, 'rule-based');
      return json({ data: suggestion, source: 'rule-based' });
    }

    // ── Build AI prompt ──────────────────────────────────────────────────────
    const sessionHistory = sessions.map((s, i) => {
      const workingSets = s.sets
        .filter((set) => (set.set_type === 'working' || set.set_type === 'top') && set.is_completed)
        .map((set) => {
          const vals = { ...set.values };
          return vals;
        });
      return {
        session:           i + 1, // 1 = most recent
        date:              s.started_at.split('T')[0],
        all_sets_complete: s.allSetsCompleted,
        working_sets:      workingSets,
        set_count:         workingSets.length,
      };
    });

    // Compute session gap for context
    const latestDate = new Date(sessions[0].started_at);
    const now = new Date();
    const daysSinceLastSession = Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

    // Detect per-set rep patterns for context
    const latestWorkingSets = sessions[0].sets
      .filter((s) => (s.set_type === 'working' || s.set_type === 'top') && s.is_completed);
    const latestReps = latestWorkingSets.map((s) => Number(s.values.reps ?? 0)).filter((r) => r > 0);
    const hasRepDropoff = latestReps.length >= 3 && latestReps[0] > latestReps[latestReps.length - 1];

    // Extract RIR if available
    const rirValues = latestWorkingSets
      .map((s) => Number(s.values.rir ?? -1))
      .filter((r) => r >= 0);
    const avgRir = rirValues.length > 0 ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length : -1;
    const minRir = rirValues.length > 0 ? Math.min(...rirValues) : -1;

    // Build context section
    const contextLines: string[] = [];
    if (daysSinceLastSession >= 14) {
      contextLines.push(`⚠️ It has been ${daysSinceLastSession} days since their last session. They are returning from a break — prioritise matching previous performance over progressing. Outcome should be 'deload'.`);
    } else if (daysSinceLastSession >= 7) {
      contextLines.push(`Note: ${daysSinceLastSession} days since last session — moderate gap, be conservative with progression.`);
    }
    if (plateau.is_plateau) {
      contextLines.push(`⚠️ Plateau detected: estimated 1RM has not improved for ${plateau.stalled} consecutive sessions. Outcome should be 'plateau_detected'.`);
    }
    if (hasRepDropoff && latestReps.length >= 3) {
      contextLines.push(`Rep pattern shows fatigue drop-off across sets: ${latestReps.join(', ')}. This is normal — factor it into realistic targets. Outcome: 'hold'.`);
    }
    if (rirValues.length > 0 && minRir <= 1) {
      contextLines.push(`RIR ${minRir} across sets — near failure. Outcome should be 'hold'.`);
    } else if (rirValues.length > 0 && avgRir >= 3) {
      contextLines.push(`RIR ${Math.round(avgRir)} on average — more in the tank. Outcome should be 'progress'.`);
    }

    const systemPrompt = `You are a knowledgeable, encouraging strength coach giving brief next-session targets. Think like a coach who knows their athlete's numbers. Be specific and reference their actual data. Write rationales as short coaching cues (under 200 chars), not generic advice. Respond ONLY with valid JSON. No markdown, no prose.`;

    const userPrompt = `EXERCISE: ${exercise.name}
TRACKING TYPE: ${trackingType}
DAYS SINCE LAST SESSION: ${daysSinceLastSession}
${contextLines.length > 0 ? `\nCONTEXT:\n${contextLines.join('\n')}\n` : ''}
RECENT SESSIONS (session 1 = most recent):
${JSON.stringify(sessionHistory, null, 2)}

COACHING RULES:
1. Primary target: a realistic, achievable next-session target using only the tracked fields
2. Alternative target: a different progression path (e.g., if primary is +weight, alternative could be +reps)
3. Use the DOUBLE PROGRESSION model: increase reps within a range first, then bump weight and reset reps
4. If no improvement for 3+ sessions at the same weight, set plateau_flag to true
5. Never suggest more than +5% load, +2 reps, or +2 laps in one step
6. If they had an off day (performance dropped), suggest matching their recent best — allow reductions down to -10% if data supports a deload
7. If returning from a break (7+ days), suggest matching their last session, not progressing
8. If reps drop across sets (e.g., 10, 9, 8), that's normal fatigue — set a realistic target for the weakest set, not just the best
9. For bodyweight work (added_weight + reps), progress reps first, then add small external load
10. Reference actual numbers from their data in the rationale
11. Set outcome to one of: 'progress', 'hold', 'deload', 'plateau_detected', 'insufficient_evidence'
12. Provide a human-readable reason for the outcome

Respond ONLY with this exact JSON structure (no other text):
{"primary":{"weight":number|null,"added_weight":number|null,"reps":number|null,"laps":number|null,"duration":number|null,"distance":number|null,"rationale":"string max 200 chars"},"alternative":{"weight":number|null,"added_weight":number|null,"reps":number|null,"laps":number|null,"duration":number|null,"distance":number|null,"rationale":"string max 200 chars"},"outcome":"progress|hold|deload|plateau_detected|insufficient_evidence","reason":"string max 300 chars","plateau_flag":boolean}`;

    // ── Rate limit check (Pro users) ────────────────────────────────────────────
    const HOURLY_AI_CAP = 30; // max AI suggestion generations per hour per user
    let rateLimited = false;
    if (isPro) {
      const { data: rateResult } = await supabase.rpc('get_ai_rate_limit', {
        p_user_id: userId,
      });
      if (rateResult && rateResult.length > 0 && rateResult[0].call_count >= HOURLY_AI_CAP) {
        rateLimited = true;
        console.warn(
          `[generate-ai-suggestion] Rate limit hit for user ${userId}: ${rateResult[0].call_count}/${HOURLY_AI_CAP}`,
        );
      }
    }

    // ── Call OpenAI (Pro only, not rate-limited) ────────────────────────────────
    let suggestion: AISuggestion | null = null;
    let source = 'rule-based';

    if (isPro && !rateLimited) {
      try {
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

        const openai = new OpenAI({ apiKey });

        const response = await openai.chat.completions.create({
          model:           'gpt-4o',
          response_format: { type: 'json_object' },
          temperature:     0.3,
          max_tokens:      400,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
        });

        const rawText = response.choices[0]?.message?.content ?? '{}';
        const parsed  = JSON.parse(rawText);
        const valid   = validateSuggestion(parsed);

        if (valid) {
          suggestion = applyBounds(valid, baseline);
          source     = 'ai';
          console.log('[generate-ai-suggestion] AI suggestion generated for exercise', exerciseId);
        } else {
          console.warn('[generate-ai-suggestion] AI response failed validation, using rule-based');
        }

        // ── Track rate limit usage ─────────────────────────────────────────────
        await supabase.rpc('increment_ai_rate_limit', { p_user_id: userId }).catch(() => {});
      } catch (aiErr) {
        console.error('[generate-ai-suggestion] OpenAI call failed:', (aiErr as Error).message);
        // Fall through to rule-based
      }
    }

    // ── Fallback if AI failed ────────────────────────────────────────────────
    if (!suggestion) {
      suggestion = deterministicProgression(sessions, exercise.tracking_schema, plateau);
      source = 'rule-based';
    }

    // ── Apply server-computed plateau (overrides AI plateau_flag) ────────────
    suggestion = {
      ...suggestion,
      outcome:                 plateau.is_plateau ? 'plateau_detected' : suggestion.outcome,
      reason:                  plateau.is_plateau
        ? `Estimated 1RM has not improved for ${plateau.stalled} consecutive sessions.`
        : suggestion.reason,
      plateau_flag:             plateau.is_plateau,
      plateau_intervention:     plateau.intervention,
      plateau_sessions_stalled: plateau.is_plateau ? plateau.stalled : undefined,
    };

    if (plateau.is_plateau) {
      console.log(
        `[generate-ai-suggestion] Plateau detected for exercise ${exerciseId}: ${plateau.stalled} stalled sessions`,
      );
    }

    await storeSuggestion(supabase, userId, exerciseId, suggestion, source);

    return json({ data: suggestion, source });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[generate-ai-suggestion] Fatal:', message);
    return json({ error: message }, 500);
  }
});
