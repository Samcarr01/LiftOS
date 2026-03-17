import type { AISuggestionData, SetValues, UnitPreference } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';
import {
  formatSetValues,
  pickRepresentativeSet,
  type TrackingSetLike,
} from './formatting';

const WINS_REQUIRED = 2;
const PROGRESSION_SET_TYPES = new Set(['working', 'top']);

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

function allProgressionSetsCompleted(session: ProgressHistorySession, schema: TrackingSchema): boolean {
  const progressionCandidates = session.sets.filter((set) => {
    if (PROGRESSION_SET_TYPES.has(set.set_type ?? 'working')) return true;
    return false;
  });
  const relevant = progressionCandidates.length > 0 ? progressionCandidates : session.sets;
  const trackedRelevant = relevant.filter((set) => hasTrackedValue(set.values, schema));
  if (trackedRelevant.length === 0) return false;
  return trackedRelevant.every((set) => set.is_completed !== false);
}

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

function dateKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function countSeparateWins(
  sessions: ProgressHistorySession[],
  schema: TrackingSchema,
  lastProgressionDate: string | null,
): number {
  const byDate = new Map<string, boolean>();

  for (const session of sessions) {
    const workoutDate = dateKey(session.completedAt);
    if (lastProgressionDate && workoutDate <= lastProgressionDate) continue;
    const existing = byDate.get(workoutDate) ?? false;
    byDate.set(workoutDate, existing || allProgressionSetsCompleted(session, schema));
  }

  return Array.from(byDate.values()).filter(Boolean).length;
}

function buildHoldSuggestion(
  schema: TrackingSchema,
  baselineValues: SuggestionValues,
  lastDisplay: string,
  reason: string,
  separateWinCount: number,
  lastProgressionDate: string | null,
): AISuggestionData {
  const nextDisplay = formatSetValues(baselineValues as SetValues, schema, { emptyLabel: lastDisplay });

  return {
    decision: 'hold',
    metric: null,
    last_result: {
      display: lastDisplay,
      values: baselineValues,
    },
    next_target: {
      display: nextDisplay,
      values: baselineValues,
    },
    reason,
    progression: {
      eligible: false,
      separate_win_count: separateWinCount,
      wins_required: WINS_REQUIRED,
      last_progression_date: lastProgressionDate,
    },
  };
}

function progressValues(
  baselineValues: SuggestionValues,
  schema: TrackingSchema,
  unitPreference: UnitPreference,
): { metric: NonNullable<AISuggestionData['metric']>; values: SuggestionValues } {
  const keys = new Set(schema.fields.map((field) => field.key));

  if (keys.has('weight') && keys.has('reps')) {
    if ((baselineValues.weight ?? 0) > 0) {
      return {
        metric: 'weight',
        values: {
          ...baselineValues,
          weight: roundLoad((baselineValues.weight ?? 0) + (unitPreference === 'lb' ? 5 : 2.5), unitPreference),
        },
      };
    }

    return {
      metric: 'reps',
      values: {
        ...baselineValues,
        reps: Math.max(1, Math.round((baselineValues.reps ?? 0) + 1)),
      },
    };
  }

  if (keys.has('weight') && keys.has('laps')) {
    if ((baselineValues.weight ?? 0) > 0) {
      return {
        metric: 'weight',
        values: {
          ...baselineValues,
          weight: roundLoad((baselineValues.weight ?? 0) + (unitPreference === 'lb' ? 5 : 2.5), unitPreference),
        },
      };
    }

    return {
      metric: 'laps',
      values: {
        ...baselineValues,
        laps: Math.max(1, Math.round((baselineValues.laps ?? 0) + 1)),
      },
    };
  }

  if (keys.has('added_weight') && keys.has('reps')) {
    if ((baselineValues.added_weight ?? 0) > 0 || (baselineValues.reps ?? 0) >= 12) {
      return {
        metric: 'added_weight',
        values: {
          ...baselineValues,
          added_weight: roundLoad((baselineValues.added_weight ?? 0) + (unitPreference === 'lb' ? 5 : 2.5), unitPreference),
        },
      };
    }

    return {
      metric: 'reps',
      values: {
        ...baselineValues,
        reps: Math.max(1, Math.round((baselineValues.reps ?? 0) + 1)),
      },
    };
  }

  if (keys.has('distance')) {
    return {
      metric: 'distance',
      values: {
        ...baselineValues,
        distance: roundDistance((baselineValues.distance ?? 0) + 50),
      },
    };
  }

  if (keys.has('duration')) {
    return {
      metric: 'duration',
      values: {
        ...baselineValues,
        duration: Math.max(5, (baselineValues.duration ?? 0) + 5),
      },
    };
  }

  if (keys.has('laps')) {
    return {
      metric: 'laps',
      values: {
        ...baselineValues,
        laps: Math.max(1, Math.round((baselineValues.laps ?? 0) + 1)),
      },
    };
  }

  return {
    metric: 'reps',
    values: {
      ...baselineValues,
      reps: Math.max(1, Math.round((baselineValues.reps ?? 0) + 1)),
    },
  };
}

function getMetricLabel(metric: NonNullable<AISuggestionData['metric']>): string {
  switch (metric) {
    case 'weight':
      return 'weight';
    case 'added_weight':
      return 'added load';
    case 'reps':
      return 'reps';
    case 'laps':
      return 'laps';
    case 'duration':
      return 'time';
    case 'distance':
      return 'distance';
    default:
      return 'target';
  }
}

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

export function buildGuidedSuggestion(params: {
  schema: TrackingSchema;
  sessions: ProgressHistorySession[];
  previousHistory?: PreviousProgressionHistory | null;
  unitPreference: UnitPreference;
  generatedAt: string;
}): GuidedSuggestionResult | null {
  const { schema, unitPreference, generatedAt } = params;
  const sessions = [...params.sessions].sort((a, b) => (
    new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  ));

  if (sessions.length === 0) return null;

  const latestSession = sessions[0];
  const latestSets = getProgressionSets(latestSession, schema);
  const representativeSet = pickRepresentativeSet(latestSets, schema, 'best');
  if (!representativeSet) return null;

  const baselineValues = { ...representativeSet.values } as SuggestionValues;
  const lastDisplay = formatSetValues(baselineValues as SetValues, schema);
  const previousHistory = params.previousHistory ?? { lastProgressionDate: null };
  const lastProgressionDate = previousHistory.lastProgressionDate;
  const latestWorkoutDate = dateKey(latestSession.completedAt);
  const latestWasCleanWin = allProgressionSetsCompleted(latestSession, schema);
  const separateWinCount = countSeparateWins(sessions, schema, lastProgressionDate);

  if (!latestWasCleanWin) {
    const suggestion = buildHoldSuggestion(
      schema,
      baselineValues,
      lastDisplay,
      'Hold the same target next time. Finish every working set cleanly before increasing it.',
      separateWinCount,
      lastProgressionDate,
    );

    return {
      suggestion,
      historySnapshot: {
        source: 'guided-progression-v1',
        generated_at: generatedAt,
        session_id: latestSession.sessionId,
        progression: {
          decision: suggestion.decision,
          metric: suggestion.metric,
          separate_win_count: separateWinCount,
          wins_required: WINS_REQUIRED,
          last_progression_date: lastProgressionDate,
          latest_workout_date: latestWorkoutDate,
          latest_was_clean_win: latestWasCleanWin,
        },
      },
    };
  }

  if (separateWinCount < WINS_REQUIRED) {
    const remaining = WINS_REQUIRED - separateWinCount;
    const suggestion = buildHoldSuggestion(
      schema,
      baselineValues,
      lastDisplay,
      `Hold the same target next time. You need ${remaining} more clean workout day${remaining === 1 ? '' : 's'} before increasing it.`,
      separateWinCount,
      lastProgressionDate,
    );

    return {
      suggestion,
      historySnapshot: {
        source: 'guided-progression-v1',
        generated_at: generatedAt,
        session_id: latestSession.sessionId,
        progression: {
          decision: suggestion.decision,
          metric: suggestion.metric,
          separate_win_count: separateWinCount,
          wins_required: WINS_REQUIRED,
          last_progression_date: lastProgressionDate,
          latest_workout_date: latestWorkoutDate,
          latest_was_clean_win: latestWasCleanWin,
        },
      },
    };
  }

  const progressed = progressValues(baselineValues, schema, unitPreference);
  const nextDisplay = formatSetValues(progressed.values as SetValues, schema);
  const suggestion: AISuggestionData = {
    decision: 'progress',
    metric: progressed.metric,
    last_result: {
      display: lastDisplay,
      values: baselineValues,
    },
    next_target: {
      display: nextDisplay,
      values: progressed.values,
    },
    reason: `You have ${separateWinCount} clean workout days at this target, so increase the ${getMetricLabel(progressed.metric)} next time.`,
    progression: {
      eligible: true,
      separate_win_count: separateWinCount,
      wins_required: WINS_REQUIRED,
      last_progression_date: latestWorkoutDate,
    },
  };

  return {
    suggestion,
    historySnapshot: {
      source: 'guided-progression-v1',
      generated_at: generatedAt,
      session_id: latestSession.sessionId,
      progression: {
        decision: suggestion.decision,
        metric: suggestion.metric,
        separate_win_count: separateWinCount,
        wins_required: WINS_REQUIRED,
        last_progression_date: latestWorkoutDate,
        latest_workout_date: latestWorkoutDate,
        latest_was_clean_win: latestWasCleanWin,
      },
    },
  };
}
