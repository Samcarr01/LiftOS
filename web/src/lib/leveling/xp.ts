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

// ── XP rules ──────────────────────────────────────────────────────────────────

export const XP_PER_SESSION       = 50; // base for any non-light completed session
export const XP_PER_LIGHT_SESSION = 25; // showed up, doesn't count toward weekly goal
export const XP_PER_TARGET_HIT    = 50; // one bonus per ISO week the target is hit
export const XP_PER_PR_BONUS      = 75; // one bonus per session with any PR

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
  | 'holographic';

/** Lucide icon name to render inside the chip. */
export type TierIcon =
  | 'Medal' | 'Hammer' | 'Shield' | 'Mountain'
  | 'Atom'  | 'Star'   | 'Gem'    | 'Sparkles' | 'Crown';

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
 * read as the same color. Bronze (warm), Iron (cool graphite), Steel
 * (steel-blue), Obsidian (dark violet), Titan (champagne-gold pivot),
 * Platinum (pearl), Diamond (ice cyan), Mythic (magenta), Cosmic (vivid
 * purple). Animations escalate from none → continuous-presence → motion →
 * color-play, with the last three layering on particles.
 */
export const TIERS: Tier[] = [
  { id: 'bronze',   name: 'Bronze',   minLevel: 1,  icon: 'Medal',    color: '0.58 0.13 45',  animation: 'none' },
  { id: 'iron',     name: 'Iron',     minLevel: 3,  icon: 'Hammer',   color: '0.52 0.03 255', animation: 'pulse' },
  { id: 'steel',    name: 'Steel',    minLevel: 6,  icon: 'Shield',   color: '0.66 0.09 220', animation: 'breathe' },
  { id: 'obsidian', name: 'Obsidian', minLevel: 10, icon: 'Mountain', color: '0.45 0.16 290', animation: 'glint' },
  { id: 'titan',    name: 'Titan',    minLevel: 14, icon: 'Atom',     color: '0.78 0.10 95',  animation: 'glow-shift' },
  { id: 'platinum', name: 'Platinum', minLevel: 20, icon: 'Star',     color: '0.90 0.02 210', animation: 'shimmer' },
  { id: 'diamond',  name: 'Diamond',  minLevel: 28, icon: 'Gem',      color: '0.85 0.14 195', animation: 'refract' },
  { id: 'mythic',   name: 'Mythic',   minLevel: 37, icon: 'Sparkles', color: '0.68 0.25 330', animation: 'gradient-spark' },
  { id: 'cosmic',   name: 'Cosmic',   minLevel: 49, icon: 'Crown',    color: '0.72 0.22 285', animation: 'holographic' },
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
}

export interface XpInputPR {
  /** Session that earned the PR. Older records may have null. */
  session_id: string | null;
}

export interface XpBreakdown {
  /** XP from non-light completed sessions. */
  sessionsXp:      number;
  /** XP from light sessions ("showed up, no goal credit"). */
  lightSessionsXp: number;
  /** XP from weekly-target-hit bonuses. */
  targetHitsXp:    number;
  /** XP from session-level PR bonuses. */
  prsXp:           number;
  total:           number;
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
): XpBreakdown {
  const prSessionIds = new Set<string>();
  for (const pr of prs) {
    if (pr.session_id) prSessionIds.add(pr.session_id);
  }

  let sessionsXp      = 0;
  let lightSessionsXp = 0;
  let prsXp           = 0;

  // Bucket non-light sessions per ISO week for the target-hit bonus.
  const weekCounts = new Map<string, number>();

  for (const s of sessions) {
    if (s.is_light_session) {
      lightSessionsXp += XP_PER_LIGHT_SESSION;
    } else {
      sessionsXp += XP_PER_SESSION;
      const weekKey = isoWeekKey(new Date(s.started_at));
      weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);
    }
    if (prSessionIds.has(s.id)) prsXp += XP_PER_PR_BONUS;
  }

  let targetHitsXp = 0;
  for (const count of weekCounts.values()) {
    if (count >= weeklyTarget) targetHitsXp += XP_PER_TARGET_HIT;
  }

  return {
    sessionsXp,
    lightSessionsXp,
    targetHitsXp,
    prsXp,
    total: sessionsXp + lightSessionsXp + targetHitsXp + prsXp,
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
