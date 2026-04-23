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
  height?: number;
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
const DECLINE_CUMULATIVE_THRESHOLD = 0.05;
const SHARP_DECLINE_PEAK_THRESHOLD = 0.15;

// Session gap thresholds (days)
const LONG_BREAK_DAYS = 14;
const MODERATE_BREAK_DAYS = 7;

// ── Helpers (kept from v1) ───────────────────────────────────────────────────

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function roundLoad(value: number, unitPreference: UnitPreference): number {
  const step = unitPreference === 'lb' ? 5 : 2.5;
  return roundToStep(value, step);
}

/** Round UP to the next plate increment — used for progression so weight never rounds back down. */
function roundLoadUp(value: number, unitPreference: UnitPreference): number {
  const step = unitPreference === 'lb' ? 5 : 2.5;
  return Math.ceil(value / step) * step;
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
  const hasHeight = keys.has('height');

  const weightKey = hasAddedWeight ? 'added_weight' : hasHeight ? 'height' : 'weight';

  const weight = hasWeight || hasAddedWeight || hasHeight
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

  // Light sessions are filtered upstream in loadHistorySessions, so every
  // session here counts as a "real" data point for trend math.
  const analyses = sessions
    .slice(0, 5)
    .map((s) => analyzeSession(s, schema, repRange))
    .filter((a): a is SessionAnalysis => a !== null && a.e1rm > 0);

  if (analyses.length < 2) return 'stable';

  const latest = analyses[0];

  // Count consecutive trending-down pairs starting from the most recent session.
  // analyses[0] is newest; pair (i, i+1) trends down if newer < older.
  let consecutiveDownRun = 0;
  for (let i = 0; i < analyses.length - 1; i += 1) {
    if (analyses[i].e1rm < analyses[i + 1].e1rm) {
      consecutiveDownRun += 1;
    } else {
      break;
    }
  }

  // Slow-drift escape hatch: latest is 15%+ below the window peak.
  const peak = Math.max(...analyses.map((a) => a.e1rm));
  const dropFromPeak = peak > 0 ? (peak - latest.e1rm) / peak : 0;

  if (consecutiveDownRun >= 3 || dropFromPeak >= SHARP_DECLINE_PEAK_THRESHOLD) {
    return 'sharp_decline';
  }

  if (consecutiveDownRun >= 2) {
    // Cumulative drop from oldest-in-run to latest must clear the noise floor.
    const oldestInRun = analyses[consecutiveDownRun].e1rm;
    const cumulativeDrop = oldestInRun > 0 ? (oldestInRun - latest.e1rm) / oldestInRun : 0;
    if (cumulativeDrop >= DECLINE_CUMULATIVE_THRESHOLD) {
      return 'declining';
    }
  }

  // Improving: latest is 2%+ above the avg of the prior up-to-3 sessions.
  const priorWindow = analyses.slice(1, 4);
  if (priorWindow.length > 0) {
    const priorAvg = priorWindow.reduce((sum, a) => sum + a.e1rm, 0) / priorWindow.length;
    if (priorAvg > 0 && latest.e1rm / priorAvg > 1.02) return 'improving';
  }

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

// ── Session Gap ─────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

// ── Historical Attempt Tracking ─────────────────────────────────────────────

/** Check if user previously attempted a higher weight and didn't complete all sets */
function findFailedAttemptAtWeight(
  sessions: ProgressHistorySession[],
  targetWeight: number,
  weightKey: string,
  schema: TrackingSchema,
  repRange: RepRange,
): { attempted: boolean; attempts: number; bestReps: number } {
  let attempts = 0;
  let bestReps = 0;

  for (const session of sessions) {
    const analysis = analyzeSession(session, schema, repRange);
    if (!analysis) continue;

    const sessionWeight = weightKey === 'height'
      ? Math.max(...analysis.workingSets.map((s) => getNumeric(s.values, 'height')))
      : analysis.weight;

    // Check if they used a weight within 0.5 of the target
    if (Math.abs(sessionWeight - targetWeight) < 0.5) {
      if (!analysis.allSetsAtCeiling) {
        attempts++;
        const maxRep = Math.max(...analysis.reps, 0);
        if (maxRep > bestReps) bestReps = maxRep;
      }
    }
  }

  return { attempted: attempts > 0, attempts, bestReps };
}

// ── Per-Set Pattern Detection ───────────────────────────────────────────────

/** Detect if reps consistently drop off across sets (e.g., 10, 9, 8) */
function detectRepDropoff(reps: number[]): { hasDropoff: boolean; avgDropPerSet: number } {
  if (reps.length < 2) return { hasDropoff: false, avgDropPerSet: 0 };

  let totalDrop = 0;
  let drops = 0;

  for (let i = 1; i < reps.length; i++) {
    if (reps[i] < reps[i - 1]) {
      totalDrop += reps[i - 1] - reps[i];
      drops++;
    }
  }

  const avgDropPerSet = drops > 0 ? totalDrop / drops : 0;
  // Dropoff = most sets decline, with average drop >= 1 rep
  const hasDropoff = drops >= Math.floor(reps.length / 2) && avgDropPerSet >= 1;
  return { hasDropoff, avgDropPerSet };
}

// ── Suggestion Builders ──────────────────────────────────────────────────────

function computeDeloadPercent(
  sessions: ProgressHistorySession[],
  schema: TrackingSchema,
  repRange: RepRange,
): number {
  // Base: 10%. Scale based on how severe the decline is.
  if (sessions.length < 3) return 0.10;

  const analyses = sessions
    .slice(0, 5)
    .map((s) => analyzeSession(s, schema, repRange))
    .filter((a): a is SessionAnalysis => a !== null && a.e1rm > 0);

  if (analyses.length < 3) return 0.10;

  // Count consecutive declining sessions
  let decliningCount = 0;
  for (let i = 0; i < analyses.length - 1; i++) {
    if (analyses[i].e1rm < analyses[i + 1].e1rm * 0.97) {
      decliningCount++;
    } else {
      break;
    }
  }

  // Measure total drop from peak
  const peak = Math.max(...analyses.map((a) => a.e1rm));
  const current = analyses[0].e1rm;
  const dropPercent = peak > 0 ? (peak - current) / peak : 0;

  // Scale deload: 8% for mild, 10% for moderate, 15% for severe
  if (decliningCount >= 3 || dropPercent > 0.15) return 0.15;
  if (decliningCount >= 2 || dropPercent > 0.10) return 0.12;
  return 0.10;
}

function buildDeloadTarget(
  baseValues: SuggestionValues,
  schema: TrackingSchema,
  repRange: RepRange,
  unitPreference: UnitPreference,
  deloadPercent: number = 0.10,
): { values: SuggestionValues; display: string } {
  const keys = new Set(schema.fields.map((f) => f.key));

  if (keys.has('weight') && (baseValues.weight ?? 0) > 0) {
    const deloadWeight = roundLoad((baseValues.weight ?? 0) * (1 - deloadPercent), unitPreference);
    const deloadReps = repRange.max > 0 ? Math.round((repRange.min + repRange.max) / 2) : baseValues.reps;
    const values = { ...baseValues, weight: deloadWeight, ...(deloadReps !== undefined ? { reps: deloadReps } : {}) };
    return { values, display: formatSetValues(values as SetValues, schema) };
  }

  if (keys.has('added_weight') && (baseValues.added_weight ?? 0) > 0) {
    const deloadWeight = roundLoad((baseValues.added_weight ?? 0) * (1 - deloadPercent), unitPreference);
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
  exerciseNotes?: string | null;
}): GuidedSuggestionResult | null {
  const { schema, unitPreference, generatedAt, muscleGroups = [], targetRanges, trainingGoals = [], experienceLevel = 'intermediate', preferredRepRange, exerciseNotes } = params;

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
  const isHeightReps = keys.has('height') && keys.has('reps');
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
  if (keys.has('height')) {
    const maxHeight = Math.max(...latestAnalysis.workingSets.map((s) => getNumeric(s.values, 'height')));
    baselineValues.height = maxHeight;
  }

  const lastDisplay = formatSetValues(baselineValues as SetValues, schema);

  // ── Trend & plateau (computed early, used by multiple phases) ─────────────
  const trend = detectTrend(sessions, schema, repRange);
  const sessionsAtWeight = countSessionsAtSameLevel(sessions, schema, repRange);

  // ── Session gap detection ─────────────────────────────────────────────────
  const sessionGapDays = daysBetween(latestSession.completedAt, generatedAt);
  const isLongBreak = sessionGapDays >= LONG_BREAK_DAYS;
  const isModerateBreak = sessionGapDays >= MODERATE_BREAK_DAYS;

  // After a long break (14+ days), suggest holding or slight reduction — don't progress
  if (isLongBreak && isWeightReps) {
    const weeksOff = Math.round(sessionGapDays / 7);
    const holdValues = { ...baselineValues };
    // Suggest ~5% reduction after very long breaks (21+ days)
    if (sessionGapDays >= 21 && (holdValues.weight ?? holdValues.added_weight ?? 0) > 0) {
      const loadKey = keys.has('weight') ? 'weight' : 'added_weight';
      holdValues[loadKey] = roundLoad((holdValues[loadKey] ?? 0) * 0.95, unitPreference);
    }
    const holdDisplay = formatSetValues(holdValues as SetValues, schema);

    return buildResult({
      decision: sessionGapDays >= 21 ? 'deload' : 'hold',
      metric: null,
      baselineValues,
      lastDisplay,
      targetValues: holdValues,
      targetDisplay: holdDisplay,
      reason: sessionGapDays >= 21
        ? `Welcome back after ${weeksOff} weeks — ease in at ${holdDisplay} to rebuild your groove before pushing hard`
        : `It's been ${weeksOff} weeks — match ${lastDisplay} to find your rhythm again, then push from there`,
      repRange,
      category,
      trend: 'stable',
      setBreakdown: latestAnalysis.setBreakdown,
      sessionsAtWeight,
      latestSession,
      latestWorkoutDate,
      generatedAt,
      previousHistory,
      eligible: false,
      exerciseNotes,
    });
  }

  // ── Phase 1: Detect regression / bad day ───────────────────────────────────

  if (trend === 'sharp_decline' && isWeightReps) {
    // 2+ declining sessions → deload with severity-scaled percentage
    const deloadPercent = computeDeloadPercent(sessions, schema, repRange);
    const deload = buildDeloadTarget(baselineValues, schema, repRange, unitPreference, deloadPercent);
    const pctLabel = Math.round(deloadPercent * 100);

    return buildResult({
      decision: 'deload',
      metric: keys.has('weight') ? 'weight' : 'added_weight',
      baselineValues,
      lastDisplay,
      targetValues: deload.values,
      targetDisplay: deload.display,
      reason: deloadPercent >= 0.15
        ? `Your numbers have dropped significantly across multiple sessions — take it back to ${deload.display} (${pctLabel}% deload) and rebuild from a solid base`
        : `Your numbers have been declining — drop to ${deload.display} to recover, then build back stronger`,
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
      exerciseNotes,
    });
  }

  if (trend === 'declining' && isWeightReps) {
    // Single bad day → hold, but factor in break if moderate
    const reason = isModerateBreak
      ? `First session back after a week off — match ${lastDisplay} to get back in the groove`
      : `Dipped below your recent best — match ${lastDisplay} next session, everyone has off days`;

    return buildResult({
      decision: 'hold',
      metric: null,
      baselineValues,
      lastDisplay,
      targetValues: baselineValues,
      targetDisplay: lastDisplay,
      reason,
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
      exerciseNotes,
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
      exerciseNotes,
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
      exerciseNotes,
      allSessions: sessions,
      isModerateBreak,
    });
  }

  // ── Phase 3b: Double progression for height+reps (box jumps, etc) ─────────

  if (isHeightReps) {
    const heightStep = 5; // 5cm increments (standard box height steps)
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
      step: heightStep,
      unitPreference,
      trend,
      sessionsAtWeight,
      plateauThreshold,
      loadKey: 'height',
      loadUnit: 'cm',
      exerciseNotes,
      allSessions: sessions,
      isModerateBreak,
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
    exerciseNotes,
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
  loadKey?: string;   // override: 'height' for height+reps exercises
  loadUnit?: string;  // override: 'cm' for height+reps exercises
  exerciseNotes?: string | null;
  allSessions: ProgressHistorySession[];
  isModerateBreak: boolean;
}): GuidedSuggestionResult {
  const {
    keys, baselineValues, lastDisplay, latestAnalysis, latestSession,
    latestWorkoutDate, generatedAt, previousHistory, category, repRange,
    step, unitPreference, trend, sessionsAtWeight, schema, plateauThreshold,
    allSessions, isModerateBreak,
  } = params;

  const weightKey = params.loadKey ?? (keys.has('added_weight') ? 'added_weight' : 'weight');
  const metricKey = weightKey as NonNullable<AISuggestionData['metric']>;
  const displayUnit = params.loadUnit ?? (unitPreference === 'lb' ? 'lb' : 'kg');
  const numSets = latestAnalysis.workingSets.length;
  const reps = latestAnalysis.reps;

  // Per-set pattern detection
  const { hasDropoff } = detectRepDropoff(reps);

  // Check if all sets hit the rep range ceiling
  const currentLoad = (baselineValues as Record<string, number | undefined>)[weightKey] ?? 0;

  if (latestAnalysis.allSetsAtCeiling && repRange.max > 0) {
    // PROGRESS: increase load, reset reps to midpoint of range (not floor — less jarring)
    const newLoad = params.loadKey
      ? currentLoad + step  // height: simple addition, no rounding to plate increments
      : roundLoadUp(currentLoad + step, unitPreference);

    // Regression guard: if rounding still lands on same weight, fall through to hold
    if (newLoad > currentLoad) {
      // Historical attempt check: have they tried this weight before and struggled?
      const pastAttempt = findFailedAttemptAtWeight(allSessions, newLoad, weightKey, schema, repRange);

      const resetReps = Math.ceil((repRange.min + repRange.max) / 2);
      const targetValues: SuggestionValues = {
        ...baselineValues,
        [weightKey]: newLoad,
        reps: pastAttempt.attempted ? Math.max(pastAttempt.bestReps, repRange.min) : resetReps,
      };
      const targetDisplay = formatSetValues(targetValues as SetValues, schema);

      const setsLabel = numSets === 1 ? 'your set' : `all ${numSets} sets`;
      let reason: string;

      if (isModerateBreak) {
        // After a break, temper expectations even if they hit ceiling last time
        reason = `You were hitting ${repRange.max} reps before your break — try ${newLoad}${displayUnit} but don't force it if the weight feels heavy`;
      } else if (pastAttempt.attempted) {
        // They've tried this weight before and didn't complete
        const targetReps = targetValues.reps ?? resetReps;
        if (pastAttempt.attempts >= 2) {
          reason = `You've attempted ${newLoad}${displayUnit} ${pastAttempt.attempts} times before — you hit ${pastAttempt.bestReps} reps at best. Aim for ${targetReps} reps this time, you're stronger now`;
        } else {
          reason = `Nailed ${repRange.max} reps on ${setsLabel} — ${newLoad}${displayUnit} is next. You tried it once before and hit ${pastAttempt.bestReps} reps, go get it`;
        }
      } else {
        reason = `Nailed ${repRange.max} reps on ${setsLabel} — time to move up to ${newLoad}${displayUnit}, start at ${resetReps} reps and build again`;
      }

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
        exerciseNotes: params.exerciseNotes,
      });
    }
    // newLoad == currentLoad after rounding — fall through to hold path
  }

  // Not at ceiling (or weight couldn't increase) — hold load, aim for consistency
  const maxRep = Math.max(...reps);
  const minRep = Math.min(...reps);
  const targetRep = repRange.max > 0 ? repRange.max : maxRep + 1;

  const targetValues: SuggestionValues = {
    ...baselineValues,
    reps: targetRep,
  };
  const targetDisplay = formatSetValues(targetValues as SetValues, schema);

  const setsLabel = numSets === 1 ? 'your set' : `all ${numSets} sets`;
  let reason: string;

  if (isModerateBreak) {
    // After a moderate break, focus on matching rather than pushing
    reason = `First session back after a break — focus on matching ${currentLoad}${displayUnit} × ${maxRep} across ${setsLabel} before pushing for more`;
  } else if (hasDropoff && reps.length >= 3) {
    // Per-set awareness: acknowledge natural fatigue drop-off
    const firstRep = reps[0];
    const lastRep = reps[reps.length - 1];
    reason = `Your reps dropped from ${firstRep} to ${lastRep} across sets — that's normal fatigue. Get ${targetRep} on your first ${Math.ceil(reps.length / 2)} sets, the rest will follow`;
  } else if (reps.length > 1 && minRep < maxRep) {
    reason = `You hit ${maxRep} on one set but ${minRep} on another — lock in ${targetRep} across ${setsLabel} at ${currentLoad}${displayUnit} before adding weight`;
  } else {
    reason = `Solid work at ${currentLoad}${displayUnit} — push for ${targetRep} reps across ${setsLabel}, then you're ready to go up`;
  }

  // Plateau warning
  if (sessionsAtWeight >= plateauThreshold) {
    const label = params.loadKey === 'height' ? 'height' : 'weight';
    reason += ` \u00b7 You've been at this ${label} for ${sessionsAtWeight} sessions \u2014 try a deload week or swap in a variation`;
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
    exerciseNotes: params.exerciseNotes,
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
  exerciseNotes?: string | null;
}): GuidedSuggestionResult {
  const { keys, baselineValues, lastDisplay, latestSession, latestWorkoutDate, generatedAt, previousHistory, category, repRange, trend, sessionsAtWeight } = params;

  const targetValues = { ...baselineValues };
  let metric: NonNullable<AISuggestionData['metric']> = 'distance';
  let reason: string;

  if (keys.has('distance') && (baselineValues.distance ?? 0) > 0) {
    targetValues.distance = roundDistance((baselineValues.distance ?? 0) + 50);
    reason = `Good pace — push for ${targetValues.distance}m next time`;
    metric = 'distance';
  } else if (keys.has('duration') && (baselineValues.duration ?? 0) > 0) {
    const increment = (baselineValues.duration ?? 0) > 60 ? 10 : 5;
    targetValues.duration = (baselineValues.duration ?? 0) + increment;
    reason = `Nice effort — try holding for ${targetValues.duration}s next session`;
    metric = 'duration';
  } else if (keys.has('laps')) {
    targetValues.laps = (baselineValues.laps ?? 0) + 1;
    reason = `Strong finish — go for ${targetValues.laps} laps next time`;
    metric = 'laps';
  } else {
    return buildResult({
      decision: 'hold',
      metric: null,
      baselineValues,
      lastDisplay,
      targetValues: baselineValues,
      targetDisplay: lastDisplay,
      reason: 'Consistent work — keep this pace and focus on form',
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
      exerciseNotes: params.exerciseNotes,
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
    exerciseNotes: params.exerciseNotes,
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
  exerciseNotes?: string | null;
}): GuidedSuggestionResult {
  const { keys, baselineValues, lastDisplay, latestSession, latestWorkoutDate, generatedAt, previousHistory, category, repRange, trend, sessionsAtWeight, latestAnalysis } = params;

  const targetValues = { ...baselineValues };
  let metric: NonNullable<AISuggestionData['metric']> = 'reps';
  let reason = 'Good effort — try adding one more rep next session';

  if (keys.has('reps')) {
    targetValues.reps = (baselineValues.reps ?? 0) + 1;
    reason = `You're building well — go for ${targetValues.reps} reps next time`;
    metric = 'reps';
  } else if (keys.has('laps')) {
    targetValues.laps = (baselineValues.laps ?? 0) + 1;
    reason = `Solid session — push for ${targetValues.laps} laps next time`;
    metric = 'laps';
  } else if (keys.has('duration')) {
    targetValues.duration = (baselineValues.duration ?? 0) + 5;
    reason = `Nice hold — aim for ${targetValues.duration}s next session`;
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
    exerciseNotes: params.exerciseNotes,
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
  exerciseNotes?: string | null;
}): GuidedSuggestionResult {
  // Append exercise notes to reason so the user sees context (e.g. "reps = each arm")
  let reason = params.reason;
  if (params.exerciseNotes) {
    reason += ` · ${params.exerciseNotes}`;
  }

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
    reason,
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
