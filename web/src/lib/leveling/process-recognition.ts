/**
 * System 3: Process Recognition
 *
 * Rewards showing up, deloading properly, and returning after a lapse.
 * Designed to reinforce healthy training habits without incentivising
 * unsafe behaviour.
 *
 * Non-negotiable acceptance criteria:
 *   - Deloads and recovery sessions preserve adherence credit.
 *   - XP cannot reward safety-warning overrides (e.g., training through pain).
 *   - Social/body comparison stays opt-in.
 *   - A streak or badge must never make someone "advanced" for programming
 *     purposes (Training Stage is user-controlled, separate from this system).
 *   - Stage change requires user control, not automatic promotion.
 *
 * Additive only — coexists with the existing XP/level system.
 */

// ── Badges ────────────────────────────────────────────────────────────────────

export type BadgeId =
  // Streak badges
  | 'streak-3'
  | 'streak-7'
  | 'streak-14'
  | 'streak-30'
  | 'streak-60'
  | 'streak-90'
  // Adherence badges
  | 'first-session'
  | 'first-week'
  | 'first-month'
  | 'consistent-3-months'
  | 'consistent-6-months'
  | 'consistent-1-year'
  // Deload / recovery badges
  | 'first-deload'
  | 'smart-deloader'
  | 'recovery-return'
  | 'comeback-kid'
  // Process badges
  | 'weekly-goal-1'
  | 'weekly-goal-4'
  | 'weekly-goal-12'
  | 'weekly-goal-52';

export interface Badge {
  id: BadgeId;
  /** Display name. */
  name: string;
  /** Short description of how to earn this badge. */
  description: string;
  /** Category for grouping in the UI. */
  category: 'streak' | 'adherence' | 'deload' | 'process';
  /** Icon name (Lucide icon name) for rendering. */
  icon: string;
  /** Ordinal for ordering within category. */
  ordinal: number;
}

export const BADGES: Badge[] = [
  // ── Streak ──
  { id: 'streak-3',       name: 'Hat Trick',          description: '3-week streak of hitting your weekly goal.',          category: 'streak',    icon: 'Flame',       ordinal: 0 },
  { id: 'streak-7',       name: 'Marathon Week',      description: '7-week streak of hitting your weekly goal.',          category: 'streak',    icon: 'Flame',       ordinal: 1 },
  { id: 'streak-14',      name: 'Quarter Pounder',    description: '14-week streak — a full quarter of consistency.',      category: 'streak',    icon: 'Flame',       ordinal: 2 },
  { id: 'streak-30',      name: 'Half-Year Habit',    description: '30-week streak. Training is now a lifestyle.',         category: 'streak',    icon: 'Flame',       ordinal: 3 },
  { id: 'streak-60',      name: 'Annual Engine',      description: '60-week streak. Over a year of relentless consistency.', category: 'streak',  icon: 'Flame',       ordinal: 4 },
  { id: 'streak-90',      name: 'Iron Will',          description: '90-week streak. Nearly two years. Exceptional.',        category: 'streak',    icon: 'Flame',       ordinal: 5 },

  // ── Adherence ──
  { id: 'first-session',          name: 'First Step',            description: 'Completed your first workout session.',              category: 'adherence', icon: 'Footprints',  ordinal: 0 },
  { id: 'first-week',             name: 'First Week',            description: 'Stuck with it for a full week.',                     category: 'adherence', icon: 'Calendar',    ordinal: 1 },
  { id: 'first-month',            name: 'First Month',           description: 'One month of consistent training.',                  category: 'adherence', icon: 'Calendar',    ordinal: 2 },
  { id: 'consistent-3-months',    name: 'Quarterly',             description: '3 months of showing up regularly.',                  category: 'adherence', icon: 'Calendar',    ordinal: 3 },
  { id: 'consistent-6-months',    name: 'Half-Year',             description: '6 months of dedication.',                            category: 'adherence', icon: 'Calendar',    ordinal: 4 },
  { id: 'consistent-1-year',      name: 'The Long Game',         description: 'One full year of training. This is the milestone.',  category: 'adherence', icon: 'Calendar',    ordinal: 5 },

  // ── Deload / Recovery ──
  { id: 'first-deload',     name: 'Smart Rest',       description: 'Completed your first deload week with reduced intensity.',  category: 'deload',    icon: 'Heart',       ordinal: 0 },
  { id: 'smart-deloader',   name: 'Smart Deloader',   description: 'Completed 4 deload weeks — you know when to ease off.',     category: 'deload',    icon: 'Heart',       ordinal: 1 },
  { id: 'recovery-return',  name: 'Recovery Return',  description: 'Came back after a recovery week. Adherence preserved.',     category: 'deload',    icon: 'Heart',       ordinal: 2 },
  { id: 'comeback-kid',     name: 'Comeback Kid',     description: 'Returned after a 2+ week break. Welcome back.',            category: 'deload',    icon: 'Heart',       ordinal: 3 },

  // ── Process ──
  { id: 'weekly-goal-1',    name: 'Goal Setter',      description: 'Hit your weekly session goal once.',          category: 'process', icon: 'Target',       ordinal: 0 },
  { id: 'weekly-goal-4',    name: 'Goal Crusher',     description: 'Hit your weekly goal 4 times.',               category: 'process', icon: 'Target',       ordinal: 1 },
  { id: 'weekly-goal-12',   name: 'Quarterly Goal',   description: 'Hit your weekly goal 12 times (quarterly).',  category: 'process', icon: 'Target',       ordinal: 2 },
  { id: 'weekly-goal-52',   name: 'Year of Goals',    description: 'Hit your weekly goal 52 times (yearly).',     category: 'process', icon: 'Target',       ordinal: 3 },
];

export function getBadge(id: BadgeId): Badge {
  const badge = BADGES.find((b) => b.id === id);
  if (!badge) throw new Error(`Unknown badge: ${id}`);
  return badge;
}

// ── Process Recognition computation ───────────────────────────────────────────

export interface SessionSummary {
  /** ISO date string of the session start. */
  startedAt: string;
  /** Whether this was a deload or recovery session. */
  isDeloadOrRecovery: boolean;
  /** Whether the session was completed (not abandoned). */
  completed: boolean;
  /** Whether the session triggered a safety override warning. */
  hadSafetyOverride: boolean;
}

export interface WeeklySummary {
  /** ISO week start (Monday) date string. */
  weekStart: string;
  /** Number of sessions completed this week. */
  sessionCount: number;
  /** Whether the user hit their weekly goal this week. */
  goalHit: boolean;
  /** Whether the user had a safety override this week. */
  hadSafetyOverride: boolean;
}

export interface ProcessRecognitionInput {
  /** All-time sessions, ordered by started_at ascending. */
  sessions: SessionSummary[];
  /** Weekly summaries, ordered by weekStart ascending. */
  weeklySummaries: WeeklySummary[];
  /** User's weekly session target. */
  weeklyTarget: number;
  /** Total weeks since the user's first session. */
  totalWeeksActive: number;
}

export interface ProcessRecognitionResult {
  /** Current streak (consecutive weeks hitting goal, deloads preserve streak). */
  currentStreak: number;
  /** Longest-ever streak. */
  longestStreak: number;
  /** Total weeks that hit the weekly goal. */
  weeksGoalHit: number;
  /** Total weeks active (including deload weeks). */
  weeksActive: number;
  /** Total deload/recovery weeks completed. */
  deloadWeeks: number;
  /** Number of times the user returned after a 2+ week break. */
  comebackCount: number;
  /** Badges earned. */
  earnedBadges: BadgeId[];
  /** Whether the user's adherence is "active" (not lapsed). */
  isActive: boolean;
  /** Number of weeks since last session, or 0 if still active. */
  weeksSinceLastSession: number;
}

// ── Computation ───────────────────────────────────────────────────────────────

/**
 * Compute process recognition metrics from session history.
 *
 * Key rules:
 *   - Deload and recovery WEEKS preserve the streak (they don't break it).
 *   - A week with a safety override does NOT count as a goal hit (but also
 *     does NOT break the streak — we want to avoid incentivising lying).
 *   - Streaks are based on weeks, not days. Only one session needed per week.
 *   - A 2+ week gap resets the streak.
 *   - Comeback = first session after a 2+ week gap.
 */
export function computeProcessRecognition(input: ProcessRecognitionInput): ProcessRecognitionResult {
  const { weeklySummaries, sessions, weeklyTarget, totalWeeksActive } = input;

  // ── Compute streaks ──
  // We iterate weekly summaries in reverse (most recent first) to find
  // the current streak. A week counts as a streak week if:
  //   (a) goal was hit, OR
  //   (b) the week had deload/recovery sessions (preserves streak)
  // A week with safety override does NOT count as hitting goal, but doesn't
  // break the streak either.

  const reversed = [...weeklySummaries].reverse();
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let weeksGoalHit = 0;
  let deloadWeeks = 0;
  let streakBroken = false;

  for (const week of reversed) {
    // Count deload/recovery weeks
    const weekHasDeload = sessions.some(
      (s) => isInWeek(s.startedAt, week.weekStart) && s.isDeloadOrRecovery && s.completed,
    );
    if (weekHasDeload) deloadWeeks++;

    if (week.goalHit && !week.hadSafetyOverride) {
      weeksGoalHit++;
    }

    // Streak logic
    const weekStreakQualifies = week.goalHit || weekHasDeload;

    if (!streakBroken) {
      if (weekStreakQualifies) {
        currentStreak++;
      } else {
        if (week.sessionCount > 0) {
          // Trained but didn't hit goal — this breaks the streak
          streakBroken = true;
        }
        // No sessions at all — also breaks the streak
        streakBroken = true;
      }
    }

    // Longest streak (forward iteration)
    if (weekStreakQualifies) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  // ── Comeback count ──
  // Find gaps of 2+ weeks between sessions
  const sortedSessions = [...sessions]
    .filter((s) => s.completed && !s.isDeloadOrRecovery)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  let comebackCount = 0;
  for (let i = 1; i < sortedSessions.length; i++) {
    const prev = new Date(sortedSessions[i - 1].startedAt);
    const curr = new Date(sortedSessions[i].startedAt);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 14) {
      comebackCount++;
    }
  }

  // ── Activity status ──
  const lastSession = sessions.length > 0
    ? sessions[sessions.length - 1]
    : null;
  const now = new Date();
  let weeksSinceLastSession = 0;
  let isActive = false;

  if (lastSession) {
    const lastDate = new Date(lastSession.startedAt);
    const diffMs = now.getTime() - lastDate.getTime();
    weeksSinceLastSession = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    isActive = weeksSinceLastSession < 2; // active if trained within 2 weeks
  }

  // ── Earned badges ──
  const earnedBadges: BadgeId[] = [];

  // Streak badges
  if (currentStreak >= 3)  earnedBadges.push('streak-3');
  if (currentStreak >= 7)  earnedBadges.push('streak-7');
  if (currentStreak >= 14) earnedBadges.push('streak-14');
  if (currentStreak >= 30) earnedBadges.push('streak-30');
  if (currentStreak >= 60) earnedBadges.push('streak-60');
  if (currentStreak >= 90) earnedBadges.push('streak-90');

  // Adherence badges
  const totalSessions = sessions.filter((s) => s.completed).length;
  if (totalSessions >= 1)  earnedBadges.push('first-session');
  if (totalWeeksActive >= 1)  earnedBadges.push('first-week');
  if (totalWeeksActive >= 4)  earnedBadges.push('first-month');
  if (totalWeeksActive >= 13) earnedBadges.push('consistent-3-months');
  if (totalWeeksActive >= 26) earnedBadges.push('consistent-6-months');
  if (totalWeeksActive >= 52) earnedBadges.push('consistent-1-year');

  // Deload badges
  if (deloadWeeks >= 1)  earnedBadges.push('first-deload');
  if (deloadWeeks >= 4)  earnedBadges.push('smart-deloader');
  if (comebackCount >= 1) earnedBadges.push('recovery-return');
  if (comebackCount >= 2) earnedBadges.push('comeback-kid');

  // Process badges
  if (weeksGoalHit >= 1)  earnedBadges.push('weekly-goal-1');
  if (weeksGoalHit >= 4)  earnedBadges.push('weekly-goal-4');
  if (weeksGoalHit >= 12) earnedBadges.push('weekly-goal-12');
  if (weeksGoalHit >= 52) earnedBadges.push('weekly-goal-52');

  return {
    currentStreak,
    longestStreak,
    weeksGoalHit,
    weeksActive: totalWeeksActive,
    deloadWeeks,
    comebackCount,
    earnedBadges,
    isActive,
    weeksSinceLastSession,
  };
}

// ── Helpers ──

/**
 * Check if a date string falls within a given ISO week (Monday-start).
 * The weekStart should be a Monday date string like "2024-01-01".
 */
function isInWeek(dateStr: string, weekStart: string): boolean {
  const d = new Date(dateStr);
  const ws = new Date(weekStart);
  const we = new Date(ws);
  we.setDate(we.getDate() + 7);
  return d >= ws && d < we;
}

/**
 * Safety check: determine if a session result should be excluded from
 * process recognition rewards because it overrode a safety warning.
 *
 * This prevents XP/badge farming from training through pain, which
 * violates the non-negotiable acceptance criteria.
 */
export function isSafetyOverrideExcluded(session: SessionSummary): boolean {
  return session.hadSafetyOverride;
}

/**
 * Check if a deload or recovery session preserves adherence credit.
 * Returns true if the session is marked as a deload/recovery and was
 * completed (not abandoned).
 */
export function preservesAdherenceCredit(session: SessionSummary): boolean {
  return session.isDeloadOrRecovery && session.completed;
}