/**
 * System 2: Movement Mastery
 *
 * Tracks per-exercise familiarity and personal progress. Helps the user see
 * they are improving independent of absolute load.
 *
 * Based on: session count for that exercise, technique consistency, control
 * demonstrated (eccentric tempo, range of motion).
 * Not based on: absolute load, 1RM, bodyweight ratio.
 * Shown per exercise, NOT as a global rank.
 *
 * Additive only — coexists with the existing XP/level system.
 */

// ── Mastery levels ────────────────────────────────────────────────────────────

export type MasteryLevelId = 'unfamiliar' | 'familiar' | 'consistent' | 'proficient' | 'mastered';

export interface MasteryLevel {
  id: MasteryLevelId;
  /** Display label. */
  label: string;
  /** Ordinal for ordering (0 = unfamiliar, 4 = mastered). */
  ordinal: number;
  /** Minimum sessions required to reach this level. */
  minSessions: number;
  /** Description shown to the user. */
  description: string;
}

export const MASTERY_LEVELS: MasteryLevel[] = [
  {
    id: 'unfamiliar',
    label: 'Unfamiliar',
    ordinal: 0,
    minSessions: 0,
    description: 'New exercise. Still learning the movement pattern.',
  },
  {
    id: 'familiar',
    label: 'Familiar',
    ordinal: 1,
    minSessions: 3,
    description: 'You have a feel for the movement. Building consistency.',
  },
  {
    id: 'consistent',
    label: 'Consistent',
    ordinal: 2,
    minSessions: 8,
    description: 'Solid technique. You can execute this reliably session to session.',
  },
  {
    id: 'proficient',
    label: 'Proficient',
    ordinal: 3,
    minSessions: 20,
    description: 'Strong command of the exercise. You can self-correct form.',
  },
  {
    id: 'mastered',
    label: 'Mastered',
    ordinal: 4,
    minSessions: 40,
    description: 'Deep familiarity. You can coach others on this movement.',
  },
];

export function getMasteryLevel(id: MasteryLevelId): MasteryLevel {
  const level = MASTERY_LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`Unknown mastery level: ${id}`);
  return level;
}

// ── Per-exercise input ────────────────────────────────────────────────────────

export interface ExerciseMasteryInput {
  /** Number of sessions in which this exercise was performed. */
  sessionCount: number;
  /**
   * Technique consistency score (0–1) estimated from eccentric control,
   * range of motion, and form adherence across recent sessions.
   * Null if not enough data to estimate.
   */
  techniqueConsistency: number | null;
  /**
   * Control score (0–1) measuring how well the user manages the eccentric
   * (lowering) phase and avoids momentum/cheating reps.
   * Null if not enough data.
   */
  controlScore: number | null;
}

export interface ExerciseMasteryResult {
  exerciseId: string;
  exerciseName: string;
  level: MasteryLevel;
  /** 0–1 fill toward the next mastery level. */
  progressPct: number;
  /** Sessions completed for this exercise. */
  sessionCount: number;
  /** Sessions needed to reach the next level, or null if already at max. */
  sessionsToNextLevel: number | null;
}

// ── Computation ───────────────────────────────────────────────────────────────

/**
 * Compute mastery level for a single exercise.
 *
 * The primary driver is session count (how many times you've practiced the
 * movement). Technique consistency and control scores are secondary — they
 * can accelerate or decelerate the effective level but never override the
 * session-count floor.
 *
 * This means: you can't be "mastered" with only 5 sessions, even if your
 * form is perfect. And you can't be "unfamiliar" with 50 sessions even if
 * your form is rough — at that point you have deep familiarity.
 */
export function computeExerciseMastery(
  exerciseId: string,
  exerciseName: string,
  input: ExerciseMasteryInput,
): ExerciseMasteryResult {
  const { sessionCount, techniqueConsistency, controlScore } = input;

  // Effective modifier from technique + control (-1 to +1 mastery levels)
  const qualityBonus = qualityModifier(techniqueConsistency, controlScore);

  // Find the base level from session count
  let baseLevelIndex = 0;
  for (let i = MASTERY_LEVELS.length - 1; i >= 0; i--) {
    if (sessionCount >= MASTERY_LEVELS[i].minSessions) {
      baseLevelIndex = i;
      break;
    }
  }

  // Apply quality bonus, clamped to valid range
  let effectiveIndex = Math.max(0, Math.min(MASTERY_LEVELS.length - 1, baseLevelIndex + qualityBonus));
  // But never below the session-count floor of the previous level
  if (effectiveIndex > 0) {
    const floorLevel = MASTERY_LEVELS[effectiveIndex - 1];
    if (sessionCount < floorLevel.minSessions) {
      effectiveIndex = effectiveIndex - 1;
    }
  }

  const level = MASTERY_LEVELS[effectiveIndex];

  // Progress toward next level
  const nextLevel = MASTERY_LEVELS[effectiveIndex + 1] ?? null;
  let progressPct = 0;
  let sessionsToNextLevel: number | null = null;

  if (nextLevel) {
    const span = nextLevel.minSessions - level.minSessions;
    const into = sessionCount - level.minSessions;
    progressPct = span > 0 ? Math.min(1, into / span) : 0;
    sessionsToNextLevel = Math.max(0, nextLevel.minSessions - sessionCount);
  } else {
    // At max level — full bar
    progressPct = 1;
    sessionsToNextLevel = null;
  }

  return {
    exerciseId,
    exerciseName,
    level,
    progressPct,
    sessionCount,
    sessionsToNextLevel,
  };
}

/**
 * Compute a quality modifier (-1 to +1) from technique consistency and
 * control scores. Returns 0 if either score is null (insufficient data).
 */
function qualityModifier(
  techniqueConsistency: number | null,
  controlScore: number | null,
): number {
  if (techniqueConsistency === null || controlScore === null) return 0;

  const avg = (techniqueConsistency + controlScore) / 2;

  if (avg >= 0.85) return 1;
  if (avg >= 0.70) return 0;
  if (avg >= 0.50) return 0;
  return -1;
}

// ── Batch computation ─────────────────────────────────────────────────────────

export interface ExerciseSessionCount {
  exerciseId: string;
  exerciseName: string;
  /** Number of sessions this exercise appeared in. */
  sessionCount: number;
}

/**
 * Compute mastery for all exercises in a batch.
 *
 * Typical usage: query session counts per exercise, pass technique/control
 * data from the last N sessions if available, and get back mastery results
 * for every exercise.
 */
export function computeAllMastery(
  exercises: ExerciseSessionCount[],
  techniqueData?: Map<string, { techniqueConsistency: number | null; controlScore: number | null }>,
): ExerciseMasteryResult[] {
  return exercises.map((ex) => {
    const quality = techniqueData?.get(ex.exerciseId) ?? {
      techniqueConsistency: null,
      controlScore: null,
    };
    return computeExerciseMastery(ex.exerciseId, ex.exerciseName, {
      sessionCount: ex.sessionCount,
      techniqueConsistency: quality.techniqueConsistency,
      controlScore: quality.controlScore,
    });
  });
}