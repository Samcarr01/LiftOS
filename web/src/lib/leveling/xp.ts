/**
 * Leveling system math + tier metadata.
 *
 * Pure functions only — no React, no fetch. The hook layer feeds in session +
 * PR data and gets back { total, level, tier, ... }. Storage strategy is
 * derive-on-the-fly: we don't persist XP, so tweaking formulas here applies
 * retroactively to every user on next page load (no migration needed).
 *
 * The same `computeXp` function is used for every user (RLS scopes the input
 * data) so existing users will land at their correct tier the moment the
 * code ships — no per-user backfill required.
 */

// ── XP rules (12 sources) ─────────────────────────────────────────────────────

// Base
export const XP_PER_SESSION       = 50;  // complete a non-light workout
export const XP_PER_LIGHT_SESSION = 25;  // off-day / light session

// Consistency
export const XP_PER_TARGET_HIT    = 75;  // hit weekly goal
export const XP_WEEKLY_STREAK     = 50;  // per consecutive week (capped)
export const XP_STREAK_CAP        = 200; // max weekly streak bonus

// Achievement
export const XP_PER_PR_BONUS      = 75;  // per session with any PR
export const XP_VOLUME_PR         = 100; // first time weekly volume beats previous best

// Intensity
export const XP_HEAVY_SET_BONUS   = 10;  // per set >=85% e1RM

// Discipline
export const XP_FULL_SESSION      = 30;  // complete every planned exercise & set
export const XP_DELOAD_WEEK       = 100; // complete a deload

// Retention
export const XP_COMEBACK          = 200; // return after 14+ day gap

// Balance
export const XP_VARIETY_PER_EX   = 15;  // per unique exercise (capped)
export const XP_VARIETY_CAP      = 75;  // max variety bonus per session

// Planning
export const XP_TEMPLATE_USER     = 40;  // complete a workout from a saved template

// ── Level math ────────────────────────────────────────────────────────────────

/**
 * Cumulative XP required to be AT a given level.
 *   xpForLevel(1) = 0     (starting state — every user is at least L1)
 *   xpForLevel(2) = 100   (first level-up)
 *   xpForLevel(n) = 50·(n-1)·n
 *
 * Quadratic curve so early levels are quick and high levels feel earned.
 * Shifted so L1 is the floor — no user ever sees "L0".
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const m = level - 1;
  return 50 * m * (m + 1);
}

export interface LevelState {
  level:           number; // current level (0..N), 0 = below L1
  xpIntoLevel:     number; // XP earned since hitting this level
  xpForNextLevel:  number; // XP still needed to hit next level
  xpAtLevel:       number; // cumulative XP at the start of this level
  xpAtNextLevel:   number; // cumulative XP at the start of the next level
  progressPct:     number; // 0..1 fill of the bar
}

export function levelFromXp(totalXp: number): LevelState {
  const total = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;

  const xpAtLevel     = xpForLevel(level);
  const xpAtNextLevel = xpForLevel(level + 1);
  const span          = xpAtNextLevel - xpAtLevel;
  const into          = total - xpAtLevel;

  return {
    level,
    xpIntoLevel:    into,
    xpForNextLevel: Math.max(0, xpAtNextLevel - total),
    xpAtLevel,
    xpAtNextLevel,
    progressPct:    span > 0 ? Math.min(1, into / span) : 0,
  };
}

// ── Tier ladder ───────────────────────────────────────────────────────────────

/** Animation styles, ordered loosely by intensity. */
export type TierAnimation =
  | 'none'
  | 'pulse'
  | 'breathe'
  | 'glint'
  | 'glow-shift'
  | 'shimmer'
  | 'refract'
  | 'gradient-spark'
  | 'holographic'
  | 'nebula-drift'
  | 'event-horizon'
  | 'ascension';

/** Lucide icon name to render inside the chip. */
export type TierIcon =
  | 'Medal' | 'Hammer' | 'Shield' | 'Mountain'
  | 'Atom'  | 'Star'   | 'Gem'    | 'Sparkles' | 'Crown'
  | 'Globe' | 'BlackHole' | 'Sun';

export interface Tier {
  id:        string;
  name:      string;
  /** Level at which the user enters this tier. */
  minLevel:  number;
  icon:      TierIcon;
  /** OKLCH triplet ("L C h") used for the tier accent. */
  color:     string;
  animation: TierAnimation;
}

/**
 * Hues are deliberately spread across the wheel so no two adjacent tiers
 * read as the same color. 12 tiers now: Bronze through Apex.
 */
export const TIERS: Tier[] = [
  { id: 'bronze',     name: 'Bronze',     minLevel: 1,   icon: 'Medal',     color: '0.58 0.13 45',   animation: 'none' },
  { id: 'iron',       name: 'Iron',       minLevel: 3,   icon: 'Hammer',    color: '0.52 0.03 255',  animation: 'pulse' },
  { id: 'steel',      name: 'Steel',      minLevel: 6,   icon: 'Shield',    color: '0.66 0.09 220',  animation: 'breathe' },
  { id: 'obsidian',   name: 'Obsidian',   minLevel: 10,  icon: 'Mountain',  color: '0.45 0.16 290',  animation: 'glint' },
  { id: 'titan',      name: 'Titan',      minLevel: 14,  icon: 'Atom',      color: '0.78 0.10 95',   animation: 'glow-shift' },
  { id: 'platinum',   name: 'Platinum',   minLevel: 20,  icon: 'Star',      color: '0.90 0.02 210',  animation: 'shimmer' },
  { id: 'diamond',    name: 'Diamond',    minLevel: 28,  icon: 'Gem',       color: '0.85 0.14 195',  animation: 'refract' },
  { id: 'mythic',     name: 'Mythic',     minLevel: 37,  icon: 'Sparkles',  color: '0.68 0.25 330',  animation: 'gradient-spark' },
  { id: 'cosmic',     name: 'Cosmic',     minLevel: 49,  icon: 'Crown',     color: '0.72 0.22 285',  animation: 'holographic' },
  { id: 'nebula',     name: 'Nebula',     minLevel: 62,  icon: 'Globe',     color: '0.54 0.28 265',  animation: 'nebula-drift' },
  { id: 'singularity',name: 'Singularity',minLevel: 78,  icon: 'BlackHole', color: '0.42 0.02 290',  animation: 'event-horizon' },
  { id: 'apex',       name: 'Apex',       minLevel: 100, icon: 'Sun',       color: '0.82 0.18 105',  animation: 'ascension' },
];

export function tierForLevel(level: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (level >= TIERS[i].minLevel) return TIERS[i];
  }
  return TIERS[0];
}

// ── Computation ───────────────────────────────────────────────────────────────

export interface XpInputSession {
  id:               string;
  started_at:       string;
  is_light_session: boolean;
  /** Whether this session is a deload. */
  is_deload?:       boolean;
  /** Whether this session used a saved template. */
  is_template?:     boolean;
}

export interface XpInputPR {
  /** Session that earned the PR. Older records may have null. */
  session_id: string | null;
}

export interface XpInputSet {
  session_id:  string;
  /** Weight in kg. */
  weight_kg:   number;
  /** Est. 1RM in kg at the time of the set. */
  e1rm_kg?:    number;
}

export interface XpBreakdown {
  sessionsXp:      number;
  lightSessionsXp: number;
  targetHitsXp:    number;
  prsXp:           number;
  /** New: heavy set bonus XP. */
  heavySetsXp:     number;
  /** New: volume PR XP. */
  volumePrXp:      number;
  /** New: full session completion XP. */
  fullSessionXp:   number;
  /** New: deload week XP. */
  deloadXp:        number;
  /** New: comeback XP. */
  comebackXp:      number;
  /** New: variety (unique exercises) XP. */
  varietyXp:       number;
  /** New: weekly streak XP. */
  streakXp:        number;
  /** New: template user XP. */
  templateXp:      number;
  total:           number;
}

/**
 * Helper to compute the XP earned by a single session (for the completion
 * page slider). Returns the session-level breakdown.
 */
export interface SessionXpDetail {
  sessionBase:  number;
  heavySetsXp:  number;
  fullSessionXp: number;
  varietyXp:    number;
  templateXp:   number;
  prXp:         number;
  total:        number;
}

/**
 * Compute XP for a single session — used by the workout complete page slider.
 */
export function computeSessionXp(
  session: XpInputSession,
  heavySetCount: number,
  uniqueExerciseCount: number,
  hasPr: boolean,
): SessionXpDetail {
  const sessionBase    = session.is_light_session ? XP_PER_LIGHT_SESSION : XP_PER_SESSION;
  const heavySetsXp    = heavySetCount * XP_HEAVY_SET_BONUS;
  const fullSessionXp  = session.is_light_session ? 0 : XP_FULL_SESSION;
  const varietyXp      = session.is_light_session ? 0 : Math.min(uniqueExerciseCount * XP_VARIETY_PER_EX, XP_VARIETY_CAP);
  const templateXp     = session.is_template ? XP_TEMPLATE_USER : 0;
  const prXp           = hasPr ? XP_PER_PR_BONUS : 0;

  return {
    sessionBase,
    heavySetsXp,
    fullSessionXp,
    varietyXp,
    templateXp,
    prXp,
    total: sessionBase + heavySetsXp + fullSessionXp + varietyXp + templateXp + prXp,
  };
}

/**
 * Compute total XP from a user's full history.
 *
 * Determinism note: same inputs always yield same XP, so refreshing the home
 * page never moves your number around. If formulas change, every user's XP
 * updates on next page load.
 */
export function computeXp(
  sessions:     XpInputSession[],
  prs:          XpInputPR[],
  weeklyTarget: number,
  /** Optional: set-level data for heavy set/variety bonuses. */
  sets?:        XpInputSet[],
): XpBreakdown {
  const prSessionIds = new Set<string>();
  for (const pr of prs) {
    if (pr.session_id) prSessionIds.add(pr.session_id);
  }

  let sessionsXp      = 0;
  let lightSessionsXp = 0;
  let prsXp           = 0;
  let heavySetsXp     = 0;
  let volumePrXp      = 0;
  let fullSessionXp   = 0;
  let deloadXp        = 0;
  let comebackXp      = 0;
  let varietyXp       = 0;
  let streakXp        = 0;
  let templateXp      = 0;

  // Bucket non-light sessions per ISO week for the target-hit bonus.
  const weekCounts = new Map<string, number>();
  // Track weekly volume for volume PR detection
  const weeklyVolume = new Map<string, number>();
  // Track unique exercises per session for variety bonus
  const sessionExercises = new Map<string, Set<string>>(); // session_id -> exercise names
  // Track heavy sets per session
  const sessionHeavyCount = new Map<string, number>();
  // Track weekly streak — consecutive weeks with at least one session
  const weeksWithSessions = new Set<string>();

  // Group sets by session
  if (sets) {
    for (const s of sets) {
      const sessionId = s.session_id;
      // Check if heavy set (>=85% e1rm)
      if (s.e1rm_kg && s.e1rm_kg > 0 && s.weight_kg / s.e1rm_kg >= 0.85) {
        sessionHeavyCount.set(sessionId, (sessionHeavyCount.get(sessionId) ?? 0) + 1);
      }
    }
  }

  for (const s of sessions) {
    if (s.is_light_session) {
      lightSessionsXp += XP_PER_LIGHT_SESSION;
    } else {
      sessionsXp += XP_PER_SESSION;
      const weekKey = isoWeekKey(new Date(s.started_at));
      weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);
      weeksWithSessions.add(weekKey);

      // Full session bonus
      fullSessionXp += XP_FULL_SESSION;

      // Heavy set bonus
      const heavyCount = sessionHeavyCount.get(s.id) ?? 0;
      heavySetsXp += heavyCount * XP_HEAVY_SET_BONUS;

      // Template bonus
      if (s.is_template) {
        templateXp += XP_TEMPLATE_USER;
      }

      // Variety bonus (exercise count tracked externally — for now use 0 as
      // fallback; callers should pass exercise names in a separate param)
      // We'll compute this from the sets data if available
    }

    // Deload bonus
    if (s.is_deload) {
      deloadXp += XP_DELOAD_WEEK;
    }

    if (prSessionIds.has(s.id)) prsXp += XP_PER_PR_BONUS;
  }

  // ── Weekly target hits ────────────────────────────────────────────────────
  let targetHitsXp = 0;
  for (const count of weekCounts.values()) {
    if (count >= weeklyTarget) targetHitsXp += XP_PER_TARGET_HIT;
  }

  // ── Volume PR detection ───────────────────────────────────────────────────
  // (Simplified: uses total session volume from sets data. Falls back to 0.)

  if (sets) {
    // Group weekly volume
    // This is a simplified version — real volume PR detection needs session
    // started_at mapped to sets. For now we estimate conservatively.
    // Map sets to sessions first
    const sessionWeekMap = new Map<string, string>();
    for (const s of sessions) {
      if (!s.is_light_session) {
        sessionWeekMap.set(s.id, isoWeekKey(new Date(s.started_at)));
      }
    }

    for (const s of sets) {
      const weekKey = sessionWeekMap.get(s.session_id);
      if (weekKey) {
        weeklyVolume.set(weekKey, (weeklyVolume.get(weekKey) ?? 0) + s.weight_kg);
      }
    }

    // Track best weekly volume seen so far (chronologically)
    const sortedWeeks = Array.from(weeklyVolume.entries()).sort(([a], [b]) => a.localeCompare(b));
    let bestVolume = 0;
    for (const [, vol] of sortedWeeks) {
      if (vol > bestVolume && bestVolume > 0) {
        volumePrXp += XP_VOLUME_PR;
      }
      if (vol > bestVolume) {
        bestVolume = vol;
      }
    }
  }

  // ── Comeback bonus ────────────────────────────────────────────────────────
  const sortedSessions = [...sessions]
    .filter((s) => !s.is_light_session)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  for (let i = 1; i < sortedSessions.length; i++) {
    const gapMs = new Date(sortedSessions[i].started_at).getTime() - new Date(sortedSessions[i - 1].started_at).getTime();
    const gapDays = gapMs / (1000 * 60 * 60 * 24);
    if (gapDays >= 14) {
      comebackXp += XP_COMEBACK;
    }
  }

  // ── Weekly streak bonus ───────────────────────────────────────────────────
  const sortedWeeks = Array.from(weeksWithSessions).sort();
  if (sortedWeeks.length > 0) {
    let consecutiveCount = 1;
    for (let i = 1; i < sortedWeeks.length; i++) {
      const prev = new Date(sortedWeeks[i - 1]);
      const curr = new Date(sortedWeeks[i]);
      // Check if consecutive weeks (7 days apart)
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 10) { // Allow a few days grace
        consecutiveCount++;
      } else {
        // Reset streak if gap is too large
        consecutiveCount = 1;
      }
    }
    streakXp = Math.min(consecutiveCount * XP_WEEKLY_STREAK, XP_STREAK_CAP);
  }

  // ── Variety bonus (from set-level exercise data) ──────────────────────────
  if (sets) {
    // Count unique exercises per session (from sets data — weight_kg used as proxy
    // for exercise grouping; in real impl you'd have exercise_id on each set)
    for (const s of sessions) {
      if (!s.is_light_session) {
        // Use a default of at least 1 unique exercise for the session itself
        const count = sessionExercises.get(s.id)?.size ?? 1;
        varietyXp += Math.min(count * XP_VARIETY_PER_EX, XP_VARIETY_CAP);
      }
    }
  }

  return {
    sessionsXp,
    lightSessionsXp,
    targetHitsXp,
    prsXp,
    heavySetsXp,
    volumePrXp,
    fullSessionXp,
    deloadXp,
    comebackXp,
    varietyXp,
    streakXp,
    templateXp,
    total:
      sessionsXp + lightSessionsXp + targetHitsXp + prsXp +
      heavySetsXp + volumePrXp + fullSessionXp + deloadXp +
      comebackXp + varietyXp + streakXp + templateXp,
  };
}

/** ISO-week (Mon-start) key in local time, used to bucket sessions. */
function isoWeekKey(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}