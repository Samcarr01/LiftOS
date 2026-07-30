/**
 * System 1: Training Stage
 *
 * Controls conservative programme defaults and progression style. The stage is
 * set by the user during onboarding, NOT earned through XP. The engine may
 * suggest a stage based on training history, but the user has final control.
 *
 * 7 stages: Just Starting → Elite
 *
 * Additive only — coexists with the existing XP/level system.
 * A user's stage does NOT influence their XP tier or vice versa.
 */

// ── Stage definitions ─────────────────────────────────────────────────────────

export type TrainingStageId =
  | 'just-starting'
  | 'novice'
  | 'early-intermediate'
  | 'intermediate'
  | 'advanced-intermediate'
  | 'advanced'
  | 'elite';

export interface TrainingStage {
  id: TrainingStageId;
  /** Display label shown in UI. */
  label: string;
  /** Ordinal for ordering (0 = easiest, 6 = elite). */
  ordinal: number;
  /** Short description of what this stage means for programming. */
  description: string;
  /** Suggested default weekly session volume. */
  defaultWeeklySessions: number;
  /** Suggested default weekly target (sessions per week). */
  defaultWeeklyTarget: number;
  /** Progression style hint consumed by the AI engine. */
  progressionStyle: 'linear' | 'double-progression' | 'periodised';
  /** Whether the user can be auto-suggested to this stage. */
  suggestable: boolean;
}

export const TRAINING_STAGES: TrainingStage[] = [
  {
    id: 'just-starting',
    label: 'Just Starting',
    ordinal: 0,
    description: 'First steps. Building the habit.',
    defaultWeeklySessions: 2,
    defaultWeeklyTarget: 2,
    progressionStyle: 'linear',
    suggestable: true,
  },
  {
    id: 'novice',
    label: 'Novice',
    ordinal: 1,
    description: 'Learning form, building a base.',
    defaultWeeklySessions: 3,
    defaultWeeklyTarget: 3,
    progressionStyle: 'linear',
    suggestable: true,
  },
  {
    id: 'early-intermediate',
    label: 'Early Intermediate',
    ordinal: 2,
    description: 'Consistent. Adding structure to training.',
    defaultWeeklySessions: 3,
    defaultWeeklyTarget: 3,
    progressionStyle: 'double-progression',
    suggestable: true,
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    ordinal: 3,
    description: 'Solid foundation with regular training.',
    defaultWeeklySessions: 4,
    defaultWeeklyTarget: 4,
    progressionStyle: 'double-progression',
    suggestable: true,
  },
  {
    id: 'advanced-intermediate',
    label: 'Advanced Intermediate',
    ordinal: 4,
    description: 'Refined technique with structured programming.',
    defaultWeeklySessions: 4,
    defaultWeeklyTarget: 4,
    progressionStyle: 'periodised',
    suggestable: true,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    ordinal: 5,
    description: 'High volume, disciplined training approach.',
    defaultWeeklySessions: 5,
    defaultWeeklyTarget: 5,
    progressionStyle: 'periodised',
    suggestable: true,
  },
  {
    id: 'elite',
    label: 'Elite',
    ordinal: 6,
    description: 'Peak performance and mastery.',
    defaultWeeklySessions: 5,
    defaultWeeklyTarget: 5,
    progressionStyle: 'periodised',
    suggestable: true,
  },
];

export function getTrainingStage(id: TrainingStageId): TrainingStage {
  const stage = TRAINING_STAGES.find((s) => s.id === id);
  if (!stage) throw new Error(`Unknown training stage: ${id}`);
  return stage;
}

// ── Stage suggestion (engine guidance, not automatic) ─────────────────────────

export interface StageSuggestionInput {
  /** Total months since the user's first workout session. */
  monthsActive: number;
  /** Number of completed sessions in the last 90 days. */
  sessionsLast90Days: number;
  /** Total number of completed sessions all-time. */
  totalSessions: number;
}

/**
 * Suggest a training stage based on training history.
 *
 * Rules:
 *   - Just Starting: < 1 month active OR < 5 total sessions
 *   - Novice: 1-3 months active AND >= 5 total sessions
 *   - Early Intermediate: 3-6 months active AND >= 15 total sessions
 *   - Intermediate: 6-12 months active AND >= 30 total sessions
 *   - Advanced Intermediate: 9-18 months active AND >= 50 total sessions AND >= 24 in last 90 days
 *   - Advanced: 12-24 months active AND >= 80 total sessions AND >= 36 in last 90 days
 *   - Elite: > 24 months active AND >= 120 total sessions AND >= 48 in last 90 days
 *
 * The user ALWAYS has final control. This is a suggestion only.
 */
export function suggestStage(input: StageSuggestionInput): TrainingStage {
  const { monthsActive, sessionsLast90Days, totalSessions } = input;

  if (monthsActive > 24 && totalSessions >= 120 && sessionsLast90Days >= 48) {
    return getTrainingStage('elite');
  }

  if (monthsActive > 12 && totalSessions >= 80 && sessionsLast90Days >= 36) {
    return getTrainingStage('advanced');
  }

  if (monthsActive > 9 && totalSessions >= 50 && sessionsLast90Days >= 24) {
    return getTrainingStage('advanced-intermediate');
  }

  if (monthsActive >= 6 && totalSessions >= 30) {
    return getTrainingStage('intermediate');
  }

  if (monthsActive >= 3 && totalSessions >= 15) {
    return getTrainingStage('early-intermediate');
  }

  if (monthsActive >= 1 && totalSessions >= 5) {
    return getTrainingStage('novice');
  }

  return getTrainingStage('just-starting');
}

// ── Stage-based defaults ──────────────────────────────────────────────────────

/**
 * Get conservative weekly session target for the given stage.
 * User can override this in settings — this is the default.
 */
export function defaultWeeklyTargetForStage(stageId: TrainingStageId): number {
  return getTrainingStage(stageId).defaultWeeklyTarget;
}

/**
 * Get the default progression style for the given stage.
 * Used by the AI engine when generating progression suggestions.
 */
export function defaultProgressionStyle(stageId: TrainingStageId): TrainingStage['progressionStyle'] {
  return getTrainingStage(stageId).progressionStyle;
}

/**
 * Validate that a stage change is allowed.
 *
 * Rules:
 *   - User can always move to a lower stage (backtrack safety).
 *   - Moving up one ordinal is always allowed.
 *   - Moving up two ordinals is allowed but triggers a warning.
 *   - Moving up three or more ordinals triggers a stronger warning.
 */
export function isStageChangeAllowed(
  current: TrainingStageId,
  requested: TrainingStageId,
): { allowed: boolean; warning?: string } {
  if (current === requested) {
    return { allowed: true };
  }

  const currentOrdinal = getTrainingStage(current).ordinal;
  const requestedOrdinal = getTrainingStage(requested).ordinal;

  // Moving down is always safe
  if (requestedOrdinal < currentOrdinal) {
    return { allowed: true };
  }

  // Moving up one step
  if (requestedOrdinal - currentOrdinal === 1) {
    return { allowed: true };
  }

  // Moving up two steps at once
  if (requestedOrdinal - currentOrdinal === 2) {
    return {
      allowed: true,
      warning: 'Skipping a stage is unusual. Consider progressing through intermediate stages first.',
    };
  }

  // Moving up three or more steps
  return {
    allowed: true,
    warning: 'Jumping multiple stages is not recommended. Your programme may be too advanced for your current experience level.',
  };
}