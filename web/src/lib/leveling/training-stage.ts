/**
 * System 1: Training Stage
 *
 * Controls conservative programme defaults and progression style. The stage is
 * set by the user during onboarding, NOT earned through XP. The engine may
 * suggest a stage based on training history, but the user has final control.
 *
 * Stages:
 *   - Beginner:  conservative volume, linear progression defaults
 *   - Intermediate: moderate volume, periodisation awareness
 *   - Advanced:  higher volume, block/program awareness
 *
 * Additive only — coexists with the existing XP/level system.
 * A user's stage does NOT influence their XP tier or vice versa.
 */

// ── Stage definitions ─────────────────────────────────────────────────────────

export type TrainingStageId = 'beginner' | 'intermediate' | 'advanced';

export interface TrainingStage {
  id: TrainingStageId;
  /** Display label shown in UI. */
  label: string;
  /** Ordinal for ordering (0 = beginner, 1 = intermediate, 2 = advanced). */
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
    id: 'beginner',
    label: 'Beginner',
    ordinal: 0,
    description: 'Conservative volume, linear progression. Focus on form and consistency.',
    defaultWeeklySessions: 3,
    defaultWeeklyTarget: 3,
    progressionStyle: 'linear',
    suggestable: true,
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    ordinal: 1,
    description: 'Moderate volume, awareness of periodisation and variation.',
    defaultWeeklySessions: 4,
    defaultWeeklyTarget: 4,
    progressionStyle: 'double-progression',
    suggestable: true,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    ordinal: 2,
    description: 'Higher volume, block/program awareness. Requires structured planning.',
    defaultWeeklySessions: 5,
    defaultWeeklyTarget: 4,
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
 *   - Beginner: < 3 months active OR < 15 total sessions
 *   - Intermediate: 3–12 months active AND >= 15 total sessions
 *   - Advanced: > 12 months active AND >= 60 total sessions AND >= 36 sessions in last 90 days
 *
 * The user ALWAYS has final control. This is a suggestion only.
 */
export function suggestStage(input: StageSuggestionInput): TrainingStage {
  const { monthsActive, sessionsLast90Days, totalSessions } = input;

  if (monthsActive > 12 && totalSessions >= 60 && sessionsLast90Days >= 36) {
    return getTrainingStage('advanced');
  }

  if (monthsActive >= 3 && totalSessions >= 15) {
    return getTrainingStage('intermediate');
  }

  return getTrainingStage('beginner');
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
 *   - Moving up two ordinals (e.g. beginner → advanced) is allowed but
 *     triggers a warning confirmation in the UI.
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
  return {
    allowed: true,
    warning: 'Skipping a stage is unusual. Consider progressing through Intermediate first.',
  };
}