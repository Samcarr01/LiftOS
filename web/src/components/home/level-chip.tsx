'use client';

import { useMemo } from 'react';
import {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
  type LucideIcon,
} from 'lucide-react';
import {
  computeXp, levelFromXp, tierForLevel,
  type Tier, type TierIcon, type XpInputSession, type XpInputPR,
} from '@/lib/leveling/xp';

interface LevelChipProps {
  sessions:      XpInputSession[];
  prs:           XpInputPR[];
  weeklyTarget:  number;
}

// Map tier-config icon name strings to Lucide components.
const ICON_MAP: Record<TierIcon, LucideIcon> = {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
};

// ── Animation styles ──────────────────────────────────────────────────────────

/**
 * Each tier's animation is implemented as inline-style snippets keyed off the
 * keyframes defined in globals.css. Returning style objects keeps the CSS
 * variable (--tier-accent) and per-tier colors data-driven rather than spread
 * across stylesheets.
 */
function chipAnimationStyle(tier: Tier): React.CSSProperties {
  const accent = `oklch(${tier.color})`;
  switch (tier.animation) {
    case 'pulse':
      return { animation: 'tier-pulse 1.8s ease-in-out 3', transformOrigin: 'left center' };
    case 'breathe':
      return { animation: 'tier-breathe 3s ease-in-out infinite' };
    case 'glow-shift':
      return {
        animation: 'tier-glow-shift 4s ease-in-out infinite',
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.35)`,
      };
    case 'shimmer':
      return {
        background: `linear-gradient(110deg, transparent 30%, ${accent.replace(')', ' / 0.18)')} 50%, transparent 70%)`,
        backgroundSize: '200% 100%',
        animation: 'tier-shimmer 3.5s linear infinite',
      };
    case 'refract':
      return {
        background: `linear-gradient(110deg,
          transparent 30%,
          oklch(0.85 0.16 200 / 0.18) 45%,
          oklch(0.85 0.16 280 / 0.18) 55%,
          oklch(0.85 0.16 340 / 0.18) 65%,
          transparent 80%)`,
        backgroundSize: '250% 100%',
        animation: 'tier-refract 4s linear infinite',
      };
    case 'gradient-spark':
      return {
        background: `linear-gradient(120deg, ${accent.replace(')', ' / 0.22)')}, oklch(0.7 0.22 280 / 0.22), ${accent.replace(')', ' / 0.22)')})`,
        backgroundSize: '200% 200%',
        animation: 'tier-gradient-cycle 5s ease-in-out infinite',
      };
    case 'holographic':
      return {
        background: `linear-gradient(120deg,
          oklch(0.78 0.18 50 / 0.20),
          oklch(0.75 0.20 180 / 0.20),
          oklch(0.72 0.22 320 / 0.20),
          oklch(0.78 0.18 50 / 0.20))`,
        backgroundSize: '300% 300%',
        animation: 'tier-holographic 6s ease-in-out infinite',
      };
    case 'glint':
    case 'none':
    default:
      return {};
  }
}

/**
 * Some animations layer on top of the chip via an absolutely-positioned overlay
 * (glint sweep, particles). Returns the overlay JSX or null.
 */
function chipOverlay(tier: Tier): React.ReactNode {
  if (tier.animation === 'glint') {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden
      >
        <div
          className="absolute inset-y-0 w-1/3"
          style={{
            background: 'linear-gradient(110deg, transparent 30%, oklch(1 0 0 / 0.18) 50%, transparent 70%)',
            animation: 'tier-glint 6s ease-in-out infinite',
          }}
        />
      </div>
    );
  }
  if (tier.animation === 'holographic') {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
        {[0.2, 0.55, 0.85].map((leftPct, i) => (
          <span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white/80"
            style={{
              left: `${leftPct * 100}%`,
              top:  `${20 + i * 25}%`,
              animation: `tier-particles ${4 + i}s ease-in-out infinite`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}
      </div>
    );
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LevelChip({ sessions, prs, weeklyTarget }: LevelChipProps) {
  const { tier, level, progressPct, total, intoLevel, nextLevelAt } = useMemo(() => {
    const breakdown = computeXp(sessions, prs, weeklyTarget);
    const ls = levelFromXp(breakdown.total);
    const t = tierForLevel(ls.level);
    return {
      tier:         t,
      level:        ls.level,
      progressPct:  ls.progressPct,
      total:        breakdown.total,
      intoLevel:    ls.xpIntoLevel,
      nextLevelAt:  ls.xpAtNextLevel - ls.xpAtLevel,
    };
  }, [sessions, prs, weeklyTarget]);

  const Icon = ICON_MAP[tier.icon];
  const accent = `oklch(${tier.color})`;
  const baseAnim = chipAnimationStyle(tier);

  return (
    <div
      className="action-card relative overflow-hidden rounded-2xl px-4 py-3.5"
      style={{
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.4)`,
      }}
    >
      {/* Background animation layer (shimmer/refract/gradient/holographic) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={baseAnim}
        aria-hidden
      />
      {chipOverlay(tier)}

      <div className="relative flex items-center gap-3">
        {/* Tier icon bubble — gets the glow-shift animation in higher tiers */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `oklch(${tier.color} / 0.18)`,
            color: accent,
            boxShadow: `inset 0 1px 0 oklch(${tier.color} / 0.3)`,
            ...(tier.animation === 'glow-shift' ? baseAnim : {}),
            ...(tier.animation === 'pulse' ? baseAnim : {}),
            ...(tier.animation === 'breathe' ? baseAnim : {}),
          }}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-sm font-bold uppercase tracking-[0.12em]"
              style={{ color: accent }}
            >
              {tier.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">L{level}</span>
            <span className="ml-auto text-xs text-muted-foreground/70 tabular-nums">
              {intoLevel}/{nextLevelAt} XP
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.max(2, progressPct * 100)}%`,
                background: `linear-gradient(90deg, oklch(${tier.color} / 0.6), ${accent})`,
                boxShadow: `0 0 8px oklch(${tier.color} / 0.5)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Tiny corner annotation — total XP, for the data-curious */}
      <div className="relative mt-2 flex justify-end">
        <span className="text-[10px] text-muted-foreground/40 tabular-nums">
          {total.toLocaleString()} XP total
        </span>
      </div>
    </div>
  );
}
