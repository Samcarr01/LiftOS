/**
 * Leveling system barrel export.
 *
 * The monolithic XP/level system has been split into three independent systems
 * that coexist with the original XP module:
 *
 *   1. Training Stage (training-stage.ts)
 *      — User-controlled programming stage (7 stages from Just Starting to Elite)
 *      — NOT XP-based. Engine can suggest, user decides.
 *      — Controls conservative programme defaults and progression style.
 *
 *   2. Movement Mastery (movement-mastery.ts)
 *      — Per-exercise familiarity and progress.
 *      — Based on session count, technique consistency, control.
 *      — NOT based on absolute load or 1RM.
 *      — Shown per exercise, not globally.
 *
 *   3. Process Recognition (process-recognition.ts)
 *      — Rewards showing up, deloading properly, and returning after a lapse.
 *      — Streaks, badges, adherence metrics.
 *      — Deloads preserve streak. Safety overrides never rewarded.
 *      — Never influences Training Stage (user-controlled).
 *
 * Original XP system (xp.ts) — expanded to 12 sources, 12 tiers, session-level compute.
 *
 * See: .hermes/plans/2026-07-30-xp-leveling-overhaul.md
 * See: .hermes/plans/2026-07-30-fix-cycle-5-levels.md
 */

// ── Original XP system (expanded) ─────────────────────────────────────────────

export {
  computeXp,
  computeSessionXp,
  levelFromXp,
  xpForLevel,
  tierForLevel,
  XP_PER_SESSION,
  XP_PER_LIGHT_SESSION,
  XP_PER_TARGET_HIT,
  XP_PER_PR_BONUS,
  XP_HEAVY_SET_BONUS,
  XP_VOLUME_PR,
  XP_FULL_SESSION,
  XP_DELOAD_WEEK,
  XP_COMEBACK,
  XP_VARIETY_PER_EX,
  XP_VARIETY_CAP,
  XP_WEEKLY_STREAK,
  XP_STREAK_CAP,
  XP_TEMPLATE_USER,
  TIERS,
} from './xp';

export type {
  LevelState,
  Tier,
  TierAnimation,
  TierIcon,
  XpBreakdown,
  XpInputSession,
  XpInputPR,
  XpInputSet,
  SessionXpDetail,
} from './xp';

// ── System 1: Training Stage ──────────────────────────────────────────────────

export {
  getTrainingStage,
  suggestStage,
  defaultWeeklyTargetForStage,
  defaultProgressionStyle,
  isStageChangeAllowed,
  TRAINING_STAGES,
} from './training-stage';

export type {
  TrainingStage,
  TrainingStageId,
  StageSuggestionInput,
} from './training-stage';

// ── System 2: Movement Mastery ────────────────────────────────────────────────

export {
  getMasteryLevel,
  computeExerciseMastery,
  computeAllMastery,
  MASTERY_LEVELS,
} from './movement-mastery';

export type {
  MasteryLevel,
  MasteryLevelId,
  ExerciseMasteryInput,
  ExerciseMasteryResult,
  ExerciseSessionCount,
} from './movement-mastery';

// ── System 3: Process Recognition ─────────────────────────────────────────────

export {
  getBadge,
  computeProcessRecognition,
  isSafetyOverrideExcluded,
  preservesAdherenceCredit,
  BADGES,
} from './process-recognition';

export type {
  Badge,
  BadgeId,
  SessionSummary,
  WeeklySummary,
  ProcessRecognitionInput,
  ProcessRecognitionResult,
} from './process-recognition';