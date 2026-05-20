'use client';

/**
 * Shared visual helpers for tier chips. Both the home LevelChip and the
 * /levels detail page render tiers using these primitives so a tier's icon
 * + animation looks identical wherever it appears.
 */

import {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
  type LucideIcon,
} from 'lucide-react';
import type { Tier, TierIcon } from './xp';

export const TIER_ICON_MAP: Record<TierIcon, LucideIcon> = {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
};

export const TIER_DESCRIPTIONS: Record<string, string> = {
  bronze:   'The starting line. Every lifter begins here.',
  iron:     'First metal. You\'re building the habit.',
  steel:    'Refined. Showing up week after week.',
  obsidian: 'Sharp and uncompromising. Months of consistent work.',
  titan:    'Forged through pressure. Half a year of training behind you.',
  platinum: 'Rare. Most who start the journey never reach here.',
  diamond:  'Hardest natural material. Years of dedication.',
  mythic:   'Beyond what most achieve. Legendary territory.',
  cosmic:   'Transcendent. The standard others measure against.',
};

// ── Background animation styles ──────────────────────────────────────────────

/**
 * Background animation applied to the card body. Returns inline-style snippets
 * keyed off keyframes declared in globals.css.
 */
export function tierBackgroundStyle(tier: Tier): React.CSSProperties {
  const accent = `oklch(${tier.color})`;
  switch (tier.animation) {
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
    default:
      return {};
  }
}

/**
 * Animation applied to the icon bubble (separate from background, so e.g.
 * Steel's breathing pulse animates only the icon while the card is calm).
 */
export function tierIconStyle(tier: Tier): React.CSSProperties {
  const accent = `oklch(${tier.color})`;
  const base: React.CSSProperties = {
    background:  `oklch(${tier.color} / 0.18)`,
    color:       accent,
    boxShadow:   `inset 0 1px 0 oklch(${tier.color} / 0.3)`,
  };
  switch (tier.animation) {
    case 'pulse':
      return { ...base, animation: 'tier-pulse 1.8s ease-in-out 3', transformOrigin: 'center' };
    case 'breathe':
      return { ...base, animation: 'tier-breathe 3s ease-in-out infinite' };
    case 'glow-shift':
      return {
        ...base,
        animation: 'tier-glow-shift 4s ease-in-out infinite',
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.35)`,
      };
    default:
      return base;
  }
}

/**
 * Absolutely-positioned overlay layer for tiers whose animation can't be
 * expressed via background alone (glint sweep, particle dots).
 */
export function TierOverlayEffects({ tier }: { tier: Tier }) {
  if (tier.animation === 'glint') {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
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
