import type { AISuggestionData, SetValues, UnitPreference } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';
import {
  formatSetValues,
  type TrackingSetLike,
} from './formatting';

// ── Types ────────────────────────────────────────────────────────────────────

const PROGRESSION_SET_TYPES = new Set(['working', 'top']);

type ExerciseCategory = 'compound' | 'accessory' | 'bodyweight' | 'cardio';

interface RepRange { min: number; max: number; }

type TrendDirection = 'improving' | 'stable' | 'declining' | 'sharp_decline';

export interface ProgressHistorySession {
  sessionId: string;
  completedAt: string;
  sets: TrackingSetLike[];
}

interface SuggestionValues {
  weight?: number;
  added_weight?: number;
  reps?: number;
  laps?: number;
  duration?: number;
  distance?: number;
}

interface PreviousProgressionHistory {
  lastProgressionDate: string | null;
}

export interface GuidedSuggestionResult {
  suggestion: AISuggestionData;
  historySnapshot: {
    source: string;
    generated_at: string;
    session_id: string;
    progression: {
      decision: AISuggestionData['decision'];
      metric: AISuggestionData['metric'];
      separate_win_count: number;
      wins_required: number;
      last_progression_date: string | null;
      latest_workout_date: string;
      latest_was_clean_win: boolean;
    };
  };
}

interface SessionAnalysis {
  workingSets: TrackingSetLike[];
  weight: number;
  reps: number[];
  avgReps: number;
  e1rm: number;
  allSetsAtCeiling: boolean;
  setBreakdown: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const COMPOUND_GROUPS = new Set([
  'chest', 'back', 'quads', 'glutes', 'hamstrings', 'legs',
]);

const DEFAULT_REP_RANGES: Record<ExerciseCategory, RepRange> = {
  compound:   { min: 6, max: 10 },
  accessory:  { min: 10, max: 15 },
  bodyweight: { min: 8, max: 15 },
  cardio:     { min: 0, max: 0 },
};

const PLATEAU_THRESHOLD = 4;
const E1RM_DECLINE_THRESHOLD = 0.10;

// ── Helpers (kept from v1) ───────────────────────────────────────────────────

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function roundLoad(value: number, unitPreference: UnitPreference): number {
  const step = unitPreference === 'lb' ? 5 : 2.5;
  return roundToStep(value, step);
}

function roundDistance(value: number): number {
  return roundToStep(value, 50);
}

function hasTrackedValue(values: SetValues, schema: TrackingSchema): boolean {
  return schema.fields.some((field) => {
    const raw = values[field.key];
    if (typeof raw === 'number') return raw > 0;
    if (typeof raw === 'string') return raw.trim().length > 0;
    return false;
  });
}

function getCompletedSets(session: ProgressHistorySession, schema: TrackingSchema): TrackingSetLike[] {
  return session.sets.filter((set) => set.is_completed !== false && hasTrackedValue(set.values, schema));
}

function getProgressionSets(session: ProgressHistorySession, schema: TrackingSchema): TrackingSetLike[] {
  const completedSets = getCompletedSets(session, schema);
  const workingSets = completedSets.filter((set) => PROGRESSION_SET_TYPES.has(set.set_type ?? 'working'));
  return workingSets.length > 0 ? workingSets : completedSets;
}

function dateKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function getNumeric(values: SetValues, key: string): number {
  const raw = values[key];
  return typeof raw === 'number' ? raw : 0;
}

// ── Exercise Classification ──────────────────────────────────────────────────

function classifyExercise(muscleGroups: string[], schema: TrackingSchema): ExerciseCategory {
  const keys = new Set(schema.fields.map((f) => f.key));

  // Bodyweight: has added_weight + reps
  if (keys.has('added_weight') && keys.has('reps')) return 'bodyweight';

  // Cardio: distance or duration only (no weight/reps)
  if (!keys.has('weight') && !keys.has('reps') && (keys.has('distance') || keys.has('duration'))) {
    return 'cardio';
  }

  // Compound vs accessory based on muscle groups
  const hasCompound = muscleGroups.some((g) => COMPOUND_GROUPS.has(g.toLowerCase()));
  return hasCompound ? 'compound' : 'accessory';
}

// Goal-aware rep ranges: when user has set goals, adjust defaults accordingly
const GOAL_REP_RANGES: Record<string, Record<ExerciseCategory, RepRange>> = {
  strength:  { compound: { min: 3, max: 6 }, accessory: { min: 6, max: 10 }, bodyweight: { min: 5, max: 10 }, cardio: { min: 0, max: 0 } },
  muscle:    { compound: { min: 8, max: 12 }, accessory: { min: 10, max: 15 }, bodyweight: { min: 8, max: 15 }, cardio: { min: 0, max: 0 } },
  fat_loss:  { compound: { min: 10, max: 15 }, accessory: { min: 12, max: 20 }, bodyweight: { min: 10, max: 20 }, cardio: { min: 0, max: 0 } },
  endurance: { compound: { min: 12, max: 20 }, accessory: { min: 15, max: 25 }, bodyweight: { min: 12, max: 25 }, cardio: { min: 0, max: 0 } },
  athletic:  { compound: { min: 5, max: 8 }, accessory: { min: 8, max: 12 }, bodyweight: { min: 6, max: 12 }, cardio: { min: 0, max: 0 } },
  health:    { compound: { min: 8, max: 15 }, accessory: { min: 10, max: 15 }, bodyweight: { min: 8, max: 15 }, cardio: { min: 0, max: 0 } },
  // Legacy key from old onboarding
  fitness:   { compound: { min: 10, max: 15 }, accessory: { min: 12, max: 20 }, bodyweight: { min: 10, max: 20 }, cardio: { min: 0, max: 0 } },
};

function getRepRange(
  category: ExerciseCategory,
  targetRanges?: Record<string, { min?: number; max?: number }> | null,
  trainingGoals?: string[],
  preferredRepRange?: { min: number; max: number } | null,
): RepRange {
  // Use template-level override if available (highest priority)
  if (targetRanges?.reps) {
    const { min, max } = targetRanges.reps;
    if (typeof min === 'number' && typeof max === 'number' && min > 0 && max >= min) {
      return { min, max };
    }
  }

  // Use user's preferred rep range (second priority, for compound/accessory)
  if (preferredRepRange && category !== 'cardio') {
    return { min: preferredRepRange.min, max: preferredRepRange.max };
  }

  // Use training goals to determine rep range
  if (trainingGoals && trainingGoals.length > 0) {
    // When multiple goals, blend by using the broadest range
    let min = Infinity;
    let max = 0;
    for (const goal of trainingGoals) {
      const goalRanges = GOAL_REP_RANGES[goal];
      if (goalRanges) {
        const range = goalRanges[category];
        if (range.min < min) min = range.min;
        if (range.max > max) max = range.max;
      }
    }
    if (min !== Infinity && max > 0) return { min, max };
  }

  return DEFAULT_REP_RANGES[category];
}

function getWeightStep(category: ExerciseCategory, unitPreference: UnitPreference): number {
  if (category === 'accessory') {
    return unitPreference === 'lb' ? 2.5 : 1;
  }
  return unitPreference === 'lb' ? 5 : 2.5;
}

// ── e1RM ─────────────────────────────────────────────────────────────────────

function computeE1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

// ── Session Analysis ─────────────────────────────────────────────────────────

function analyzeSession(
  session: ProgressHistorySession,
  schema: TrackingSchema,
  repRange: RepRange,
): SessionAnalysis | null {
  const workingSets = getProgressionSets(session, schema);
  if (workingSets.length === 0) return null;

  const keys = new Set(schema.fields.map((f) => f.key));
  const hasWeight = keys.has('weight');
  const hasReps = keys.has('reps');
  const hasAddedWeight = keys.has('added_weight');

  const weightKey = hasAddedWeight ? 'added_weight' : 'weight';

  const weight = hasWeight || hasAddedWeight
    ? Math.max(...workingSets.map((s) => getNumeric(s.values, weightKey)))
    : 0;

  const reps = hasReps
    ? workingSets.map((s) => getNumeric(s.values, 'reps'))
    : [];

  const avgReps = reps.length > 0 ? reps.reduce((a, b) => a + b, 0) / reps.length : 0;

  const e1rm = hasWeight && hasReps
    ? Math.max(...workingSets.map((s) => computeE1rm(getNumeric(s.values, 'weight'), getNumeric(s.values, 'reps'))))
    : hasAddedWeight && hasReps
      ? Math.max(...workingSets.map((s) => computeE1rm(getNumeric(s.values, 'added_weight'), getNumeric(s.values, 'reps'))))
      : 0;

  const allSetsAtCeiling = hasReps && repRange.max > 0
    ? reps.every((r) => r >= repRange.max)
    : false;

  const setBreakdown = hasReps
    ? reps.join(', ')
    : workingSets.map((s) => formatSetValues(s.values, schema)).join(', ');

  return { workingSets, weight, reps, avgReps, e1rm, allSetsAtCeiling, setBreakdown };
}

// ── Trend Detection ──────────────────────────────────────────────────────────

function detectTrend(
  sessions: ProgressHistorySession[],
  schema: TrackingSchema,
  repRange: RepRange,
): TrendDirection {
  if (sessions.length < 2) return 'stable';

  const analyses = sessions
    .slice(0, 5)
    .map((s) => analyzeSession(s, schema, repRange))
    .filter((a): a is SessionAnalysis => a !== null && a.e1rm > 0);

  if (analyses.length < 2) return 'stable';

  const latest = analyses[0];
  const previousAvg = analyses.slice(1, 4).reduce((sum, a) => sum + a.e1rm, 0) / Math.min(analyses.length - 1, 3);

  if (previousAvg === 0) return 'stable';

  const ratio = latest.e1rm / previousAvg;

  // Sharp decline: >10% drop
  if (ratio < (1 - E1RM_DECLINE_THRESHOLD)) {
    // Check if the previous session was also declining
    if (analyses.length >= 3 && analyses[1].e1rm < previousAvg * 0.95) {
      return 'sharp_decline'; // 2+ declining sessions → deload
    }
    return 'declining'; // Single bad day
  }

  if (ratio > 1.02) return 'improving';
  return 'stable';
}

// ── Plateau Detection ────────────────────────────────────────────────────────

function countSessionsAtSameLevel(
  sessions: ProgressHistorySession[],
  schema: TrackingSchema,
  repRange: RepRange,
): number {
  if (sessions.length < 2) return 0;

  const analyses = sessions
    .slice(0, 8)
    .map((s) => analyzeSession(s, schema, repRange))
    .filter((a): a is SessionAnalysis => a !== null);

  if (analyses.length < 2) return 0;

  const latest = analyses[0];
  let count = 1;

  for (let i = 1; i < analyses.length; i++) {
    const a = analyses[i];
    // Same level: same weight (within rounding) and similar avg reps (within 1)
    if (Math.abs(a.weight - latest.weight) < 0.1 && Math.abs(a.avgReps - latest.avgReps) < 1.5) {
      count++;
    } else {
      break;
    }
  }

  return count;
}

// ── Suggestion Builders ──────────────────────────────────────────────────────

function buildDeloadTarget(
  baseValues: SuggestionValues,
  schema: TrackingSchema,
  repRange: RepRange,
  unitPreference: UnitPreference,
): { values: SuggestionValues; display: string } {
  const keys = new Set(schema.fields.map((f) => f.key));

  if (keys.has('weight') && (baseValues.weight ?? 0) > 0) {
    const deloadWeight = roundLoad((baseValues.weight ?? 0) * 0.9, unitPreference);
    const deloadReps = repRange.max > 0 ? Math.round((repRange.min + repRange.max) / 2) : baseValues.reps;
    const values = { ...baseValues, weight: deloadWeight, ...(deloadReps !== undefined ? { reps: deloadReps } : {}) };
    return { values, display: formatSetValues(values as SetValues, schema) };
  }

  if (keys.has('added_weight') && (baseValues.added_weight ?? 0) > 0) {
    const deloadWeight = roundLoad((baseValues.added_weight ?? 0) * 0.9, unitPreference);
    const values = { ...baseValues, added_weight: Math.max(0, deloadWeight) };
    return { values, display: formatSetValues(values as SetValues, schema) };
  }

  // For non-weight exercises, just return current values
  return { values: baseValues, display: formatSetValues(baseValues as SetValues, schema) };
}

// ── Previous History Parsing ─────────────────────────────────────────────────

export function parsePreviousProgressionHistory(raw: unknown): PreviousProgressionHistory {
  if (typeof raw !== 'object' || raw === null) {
    return { lastProgressionDate: null };
  }

  const progression = (raw as { progression?: { last_progression_date?: unknown } }).progression;
  const lastProgressionDate = typeof progression?.last_progression_date === 'string'
    ? progression.last_progression_date
    : null;

  return { lastProgressionDate };
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

export function buildGuidedSuggestion(params: {
  schema: TrackingSchema;
  sessions: ProgressHistorySession[];
  previousHistory?: PreviousProgressionHistory | null;
  unitPreference: UnitPreference;
  generatedAt: string;
  muscleGroups?: string[];
  targetRanges?: Record<string, { min?: number; max?: number }> | null;
  trainingGoals?: string[];
  experienceLevel?: string;
  preferredRepRange?: { min: number; max: number } | null;
}): GuidedSuggestionResult | null {
  const { schema, unitPreference, generatedAt, muscleGroups = [], targetRanges, trainingGoals = [], experienceLevel = 'intermediate', preferredRepRange } = params;

  const sessions = [...params.sessions].sort((a, b) => (
    new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  ));

  if (sessions.length === 0) return null;

  const category = classifyExercise(muscleGroups, schema);
  const repRange = getRepRange(category, targetRanges, trainingGoals, preferredRepRange);
  const step = getWeightStep(category, unitPreference);
  // Beginners plateau faster (3 sessions), advanced lifters tolerate more stagnation (5)
  const plateauThreshold = experienceLevel === 'beginner' ? 3 : experienceLevel === 'advanced' ? 5 : PLATEAU_THRESHOLD;
  const latestSession = sessions[0];
  const latestWorkoutDate = dateKey(latestSession.completedAt);
  const previousHistory = params.previousHistory ?? { lastProgressionDate: null };

  const latestAnalysis = analyzeSession(latestSession, schema, repRange);
  if (!latestAnalysis) return null;

  const keys = new Set(schema.fields.map((f) => f.key));
  const isWeightReps = (keys.has('weight') || keys.has('added_weight')) && keys.has('reps');
  const isCardio = category === 'cardio';

  // Build baseline values from the latest session's working sets
  const baselineValues: SuggestionValues = {};
  if (keys.has('weight')) baselineValues.weight = latestAnalysis.weight;
  if (keys.has('added_weight')) baselineValues.added_weight = latestAnalysis.weight;
  if (keys.has('reps')) baselineValues.reps = Math.round(latestAnalysis.avgReps);
  if (keys.has('laps')) {
    const maxLaps = Math.max(...latestAnalysis.workingSets.map((s) => getNumeric(s.values, 'laps')));
    baselineValues.laps = maxLaps;
  }
  if (keys.has('duration')) {
    const maxDuration = Math.max(...latestAnalysis.workingSets.map((s) => getNumeric(s.values, 'duration')));
    baselineValues.duration = maxDuration;
  }
  if (keys.has('distance')) {
    const maxDistance = Math.max(...latestAnalysis.workingSets.map((s) => getNumeric(s.values, 'distance')));
    baselineValues.distance = maxDistance;
  }

  const lastDisplay = formatSetValues(baselineValues as SetValues, schema);

  // ── Phase 1: Detect regression / bad day ───────────────────────────────────

  const trend = detectTrend(sessions, schema, repRange);
  const sessionsAtWeight = countSessionsAtSameLevel(sessions, schema, repRange);

  if (trend === 'sharp_decline' && isWeightReps) {
    // 2+ declining sessions → deload
    const deload = buildDeloadTarget(baselineValues, schema, repRange, unitPreference);

    return buildResult({
      decision: 'deload',
      metric: keys.has('weight') ? 'weight' : 'added_weight',
      baselineValues,
      lastDisplay,
      targetValues: deload.values,
      targetDisplay: deload.display,
      reason: `Performance dropping across sessions — deload to ${deload.display} for recovery, then build back`,
      repRange,
      category,
      trend: 'sharp_decline',
      setBreakdown: latestAnalysis.setBreakdown,
      sessionsAtWeight,
      latestSession,
      latestWorkoutDate,
      generatedAt,
      previousHistory,
      eligible: false,
    });
  }

  if (trend === 'declining' && isWeightReps) {
    // Single bad day → hold
    return buildResult({
      decision: 'hold',
      metric: null,
      baselineValues,
      lastDisplay,
      targetValues: baselineValues,
      targetDisplay: lastDisplay,
      reason: `Off day — repeat ${lastDisplay} next time`,
      repRange,
      category,
      trend: 'declining',
      setBreakdown: latestAnalysis.setBreakdown,
      sessionsAtWeight,
      latestSession,
      latestWorkoutDate,
      generatedAt,
      previousHistory,
      eligible: false,
    });
  }

  // ── Phase 2: Cardio progression ────────────────────────────────────────────

  if (isCardio) {
    return buildCardioSuggestion({
      keys,
      baselineValues,
      lastDisplay,
      latestSession,
      latestWorkoutDate,
      generatedAt,
      previousHistory,
      category,
      repRange,
      trend,
      sessionsAtWeight,
    });
  }

  // ── Phase 3: Double progression for weight+reps exercises ──────────────────

  if (isWeightReps) {
    return buildDoubleProgressionSuggestion({
      keys,
      schema,
      baselineValues,
      lastDisplay,
      latestAnalysis,
      latestSession,
      latestWorkoutDate,
      generatedAt,
      previousHistory,
      category,
      repRange,
      step,
      unitPreference,
      trend,
      sessionsAtWeight,
      plateauThreshold,
    });
  }

  // ── Phase 4: Fallback for other tracking schemas (laps, duration, etc) ────

  return buildFallbackSuggestion({
    keys,
    baselineValues,
    lastDisplay,
    latestSession,
    latestWorkoutDate,
    generatedAt,
    previousHistory,
    category,
    repRange,
    trend,
    sessionsAtWeight,
    latestAnalysis,
  });
}

// ── Double Progression Logic ─────────────────────────────────────────────────

function buildDoubleProgressionSuggestion(params: {
  keys: Set<string>;
  schema: TrackingSchema;
  baselineValues: SuggestionValues;
  lastDisplay: string;
  latestAnalysis: SessionAnalysis;
  latestSession: ProgressHistorySession;
  latestWorkoutDate: string;
  generatedAt: string;
  previousHistory: PreviousProgressionHistory;
  category: ExerciseCategory;
  repRange: RepRange;
  step: number;
  unitPreference: UnitPreference;
  trend: TrendDirection;
  sessionsAtWeight: number;
  plateauThreshold: number;
}): GuidedSuggestionResult {
  const {
    keys, baselineValues, lastDisplay, latestAnalysis, latestSession,
    latestWorkoutDate, generatedAt, previousHistory, category, repRange,
    step, unitPreference, trend, sessionsAtWeight, schema, plateauThreshold,
  } = params;

  const weightKey = keys.has('added_weight') ? 'added_weight' : 'weight';
  const metricKey = weightKey as NonNullable<AISuggestionData['metric']>;
  const numSets = latestAnalysis.workingSets.length;
  const reps = latestAnalysis.reps;

  // Check if all sets hit the rep range ceiling
  if (latestAnalysis.allSetsAtCeiling && repRange.max > 0) {
    // PROGRESS: increase weight, reset reps to range floor
    const newWeight = roundLoad((baselineValues[weightKey] ?? 0) + step, unitPreference);
    const targetValues: SuggestionValues = {
      ...baselineValues,
      [weightKey]: newWeight,
      reps: repRange.min,
    };
    const targetDisplay = formatSetValues(targetValues as SetValues, schema);

    const weightUnit = unitPreference === 'lb' ? 'lb' : 'kg';
    const reason = `You hit ${baselineValues[weightKey]}${weightUnit} x ${repRange.max} on all ${numSets} sets — go to ${newWeight}${weightUnit} x ${repRange.min}`;

    return buildResult({
      decision: 'progress',
      metric: metricKey,
      baselineValues,
      lastDisplay,
      targetValues,
      targetDisplay,
      reason,
      repRange,
      category,
      trend,
      setBreakdown: latestAnalysis.setBreakdown,
      sessionsAtWeight,
      latestSession,
      latestWorkoutDate,
      generatedAt,
      previousHistory,
      eligible: true,
    });
  }

  // Not at ceiling — hold weight, aim for consistency
  const maxRep = Math.max(...reps);
  const minRep = Math.min(...reps);
  const targetRep = repRange.max > 0 ? repRange.max : maxRep + 1;
  const weightUnit = unitPreference === 'lb' ? 'lb' : 'kg';
  const currentWeight = baselineValues[weightKey] ?? 0;

  const targetValues: SuggestionValues = {
    ...baselineValues,
    reps: targetRep,
  };
  const targetDisplay = formatSetValues(targetValues as SetValues, schema);

  let reason: string;
  if (reps.length > 1 && minRep < maxRep) {
    // Inconsistent sets — guide toward consistency
    reason = `${currentWeight}${weightUnit} — aim for ${targetRep} reps on all ${numSets} sets (you got ${latestAnalysis.setBreakdown})`;
  } else {
    // Consistent but below ceiling
    reason = `Build to ${targetRep} reps at ${currentWeight}${weightUnit} on all ${numSets} sets`;
  }

  // Plateau warning
  if (sessionsAtWeight >= plateauThreshold) {
    reason += ` \u00b7 ${sessionsAtWeight} sessions at this weight \u2014 consider a deload week or exercise variation`;
  }

  return buildResult({
    decision: 'hold',
    metric: null,
    baselineValues,
    lastDisplay,
    targetValues,
    targetDisplay,
    reason,
    repRange,
    category,
    trend,
    setBreakdown: latestAnalysis.setBreakdown,
    sessionsAtWeight,
    latestSession,
    latestWorkoutDate,
    generatedAt,
    previousHistory,
    eligible: false,
  });
}

// ── Cardio Progression ───────────────────────────────────────────────────────

function buildCardioSuggestion(params: {
  keys: Set<string>;
  baselineValues: SuggestionValues;
  lastDisplay: string;
  latestSession: ProgressHistorySession;
  latestWorkoutDate: string;
  generatedAt: string;
  previousHistory: PreviousProgressionHistory;
  category: ExerciseCategory;
  repRange: RepRange;
  trend: TrendDirection;
  sessionsAtWeight: number;
}): GuidedSuggestionResult {
  const { keys, baselineValues, lastDisplay, latestSession, latestWorkoutDate, generatedAt, previousHistory, category, repRange, trend, sessionsAtWeight } = params;

  const targetValues = { ...baselineValues };
  let metric: NonNullable<AISuggestionData['metric']> = 'distance';
  let reason: string;

  if (keys.has('distance') && (baselineValues.distance ?? 0) > 0) {
    targetValues.distance = roundDistance((baselineValues.distance ?? 0) + 50);
    reason = `Add 50m — aim for ${targetValues.distance}m`;
    metric = 'distance';
  } else if (keys.has('duration') && (baselineValues.duration ?? 0) > 0) {
    const increment = (baselineValues.duration ?? 0) > 60 ? 10 : 5;
    targetValues.duration = (baselineValues.duration ?? 0) + increment;
    reason = `Add ${increment}s — aim for ${targetValues.duration}s`;
    metric = 'duration';
  } else if (keys.has('laps')) {
    targetValues.laps = (baselineValues.laps ?? 0) + 1;
    reason = `Add a lap — aim for ${targetValues.laps}`;
    metric = 'laps';
  } else {
    return buildResult({
      decision: 'hold',
      metric: null,
      baselineValues,
      lastDisplay,
      targetValues: baselineValues,
      targetDisplay: lastDisplay,
      reason: 'Keep it up — maintain current pace',
      repRange,
      category,
      trend,
      setBreakdown: '',
      sessionsAtWeight,
      latestSession,
      latestWorkoutDate,
      generatedAt,
      previousHistory,
      eligible: false,
    });
  }

  return buildResult({
    decision: 'progress',
    metric,
    baselineValues,
    lastDisplay,
    targetValues,
    targetDisplay: lastDisplay, // Will be formatted below
    reason,
    repRange,
    category,
    trend,
    setBreakdown: '',
    sessionsAtWeight,
    latestSession,
    latestWorkoutDate,
    generatedAt,
    previousHistory,
    eligible: true,
  });
}

// ── Fallback (laps-only, reps-only, weight+laps, etc) ────────────────────────

function buildFallbackSuggestion(params: {
  keys: Set<string>;
  baselineValues: SuggestionValues;
  lastDisplay: string;
  latestSession: ProgressHistorySession;
  latestWorkoutDate: string;
  generatedAt: string;
  previousHistory: PreviousProgressionHistory;
  category: ExerciseCategory;
  repRange: RepRange;
  trend: TrendDirection;
  sessionsAtWeight: number;
  latestAnalysis: SessionAnalysis;
}): GuidedSuggestionResult {
  const { keys, baselineValues, lastDisplay, latestSession, latestWorkoutDate, generatedAt, previousHistory, category, repRange, trend, sessionsAtWeight, latestAnalysis } = params;

  const targetValues = { ...baselineValues };
  let metric: NonNullable<AISuggestionData['metric']> = 'reps';
  let reason = 'Add a rep next time';

  if (keys.has('reps')) {
    targetValues.reps = (baselineValues.reps ?? 0) + 1;
    reason = `Aim for ${targetValues.reps} reps`;
    metric = 'reps';
  } else if (keys.has('laps')) {
    targetValues.laps = (baselineValues.laps ?? 0) + 1;
    reason = `Aim for ${targetValues.laps} laps`;
    metric = 'laps';
  } else if (keys.has('duration')) {
    targetValues.duration = (baselineValues.duration ?? 0) + 5;
    reason = `Aim for ${targetValues.duration}s`;
    metric = 'duration';
  }

  return buildResult({
    decision: 'progress',
    metric,
    baselineValues,
    lastDisplay,
    targetValues,
    targetDisplay: lastDisplay,
    reason,
    repRange,
    category,
    trend,
    setBreakdown: latestAnalysis.setBreakdown,
    sessionsAtWeight,
    latestSession,
    latestWorkoutDate,
    generatedAt,
    previousHistory,
    eligible: true,
  });
}

// ── Result Builder ───────────────────────────────────────────────────────────

function buildResult(params: {
  decision: AISuggestionData['decision'];
  metric: AISuggestionData['metric'];
  baselineValues: SuggestionValues;
  lastDisplay: string;
  targetValues: SuggestionValues;
  targetDisplay: string;
  reason: string;
  repRange: RepRange;
  category: ExerciseCategory;
  trend: TrendDirection;
  setBreakdown: string;
  sessionsAtWeight: number;
  latestSession: ProgressHistorySession;
  latestWorkoutDate: string;
  generatedAt: string;
  previousHistory: PreviousProgressionHistory;
  eligible: boolean;
}): GuidedSuggestionResult {
  const suggestion: AISuggestionData = {
    decision: params.decision,
    metric: params.metric,
    last_result: {
      display: params.lastDisplay,
      values: params.baselineValues,
    },
    next_target: {
      display: params.targetDisplay,
      values: params.targetValues,
    },
    reason: params.reason,
    progression: {
      eligible: params.eligible,
      separate_win_count: params.eligible ? 1 : 0,
      wins_required: 1,
      last_progression_date: params.eligible
        ? params.latestWorkoutDate
        : params.previousHistory.lastProgressionDate,
      rep_range: params.repRange.max > 0 ? params.repRange : undefined,
      set_breakdown: params.setBreakdown || undefined,
      exercise_category: params.category,
      trend: params.trend,
      sessions_at_weight: params.sessionsAtWeight > 1 ? params.sessionsAtWeight : undefined,
    },
  };

  return {
    suggestion,
    historySnapshot: {
      source: 'guided-progression-v2',
      generated_at: params.generatedAt,
      session_id: params.latestSession.sessionId,
      progression: {
        decision: params.decision,
        metric: params.metric,
        separate_win_count: params.eligible ? 1 : 0,
        wins_required: 1,
        last_progression_date: params.eligible
          ? params.latestWorkoutDate
          : params.previousHistory.lastProgressionDate,
        latest_workout_date: params.latestWorkoutDate,
        latest_was_clean_win: params.eligible,
      },
    },
  };
}
