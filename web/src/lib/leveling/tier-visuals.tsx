'use client';

/**
 * Shared visual primitives for tier chips.
 *
 * The icon is the focal point. All "cool" effects (rings, halos, orbiting
 * particles, cardinal-position sparkles) are rendered *around* the icon via
 * <TierIcon />, not as random overlays on the card. The card layer only does
 * subtle base tints and edge glows that span the whole row.
 *
 * Layout:
 *   <Card relative overflow-hidden>
 *     <TierCardEffects />       ← card-wide base tints, sweep bands, edge glows
 *     <TierIcon size={48} />    ← icon + icon-centric effect stack
 *     <text content>
 *   </Card>
 *
 * Animation rules (declared in globals.css):
 *   - Symmetric (0% === 100%) so no visible boundary, OR
 *   - Opacity 0 at endpoints so the transform teleport is hidden
 *   - Pure transform + opacity (GPU-accelerated)
 */

import {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
  Globe, Sun,
  type LucideIcon,
} from 'lucide-react';
import type { Tier, TierIcon as TierIconName } from './xp';
import React from 'react';

// BlackHole icon — we compose from Circle + Minus (no native BlackHole in lucide)
export const BlackHoleIcon = React.forwardRef<SVGSVGElement, React.ComponentPropsWithoutRef<'svg'>>(
  ({ style, ...props }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 8a8 8 0 0 1 8 8" opacity="0.6" />
      <path d="M12 16a8 8 0 0 1-8-8" opacity="0.6" />
      <path d="M8 12a8 8 0 0 1 8-8" opacity="0.4" />
      <path d="M16 12a8 8 0 0 1-8 8" opacity="0.4" />
    </svg>
  )
);
BlackHoleIcon.displayName = 'BlackHoleIcon';

export const TIER_ICON_MAP: Record<TierIconName, LucideIcon> = {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
  Globe, BlackHole: BlackHoleIcon, Sun,
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
  nebula:   'A cloud of pure potential. Years of relentless training.',
  singularity: 'The point of no return. Gravity bends around you.',
  apex:     'The summit. There is no higher tier.',
};

// ── Motion levels ────────────────────────────────────────────────────────────

/**
 * How much continuous motion a tier marker is allowed to show.
 *
 *   full   — the complete effect stack (corona, orbits, sparkles, card sweeps).
 *            Reserved for the tier the lifter is actually on.
 *   subtle — one tier-specific ambient layer around the icon. Enough to read as
 *            alive at a glance without putting a particle fleet on every row.
 *   none   — a completely static marker.
 */
export type TierMotion = 'full' | 'subtle' | 'none';

export type TierLadderState = 'passed' | 'current' | 'upcoming';

/**
 * The single place the ladder decides how much motion a row gets.
 *
 * `upcoming` deliberately maps to `subtle`, not `none`: a locked tier is still
 * meant to look like something worth climbing towards. Locked semantics are
 * carried by the lock icon, the dimming and the "Unlocks at N XP" line — not by
 * freezing the artwork. `passed` stays static so the eye is drawn forwards.
 */
export function tierMotionForState(state: TierLadderState): TierMotion {
  switch (state) {
    case 'current':  return 'full';
    case 'upcoming': return 'subtle';
    case 'passed':   return 'none';
  }
}

// ── TierIcon: icon + icon-centric effects ────────────────────────────────────

interface TierIconProps {
  tier: Tier;
  /** Icon bubble side length in px. */
  size: number;
  /** How much continuous decoration to render. Defaults to the full stack. */
  motion?: TierMotion;
}

/**
 * The icon bubble, with all icon-relative effects (rings, halos, orbits,
 * cardinal sparkles) layered around it. The wrapper is sized to the icon
 * exactly so the parent flex layout is unaffected; effect children use
 * absolute positioning relative to the bubble center so they can extend
 * outside without breaking layout.
 */
export function TierIcon({ tier, size, motion = 'full' }: TierIconProps) {
  const Icon = TIER_ICON_MAP[tier.icon];
  const iconPx = Math.round(size * 0.5);
  const accent = `oklch(${tier.color})`;
  const full = motion === 'full';

  // Back layer container: same size as icon, centered effects can use
  // negative inset to extend out without affecting layout
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      {/* Effects BEHIND the icon (rings, halos, base glow) */}
      {full && <IconBackEffects tier={tier} size={size} />}
      {motion === 'subtle' && <TierAmbientEffect tier={tier} size={size} />}

      {/* Icon bubble itself */}
      <div
        className={`relative z-10 flex h-full w-full items-center justify-center rounded-xl${full && (tier.id === 'titan' || tier.id === 'apex') ? ' tier-glow-shift' : ''}`}
        style={iconBubbleStyle(tier, !full)}
      >
        <Icon style={{ width: iconPx, height: iconPx }} strokeWidth={1.8} />
      </div>

      {/* Effects IN FRONT (sparkles in cardinal positions, foreground orbits) */}
      {full && <IconFrontEffects tier={tier} size={size} accent={accent} />}
    </div>
  );
}

// ── Ambient effect: the one layer a locked/upcoming tier keeps ───────────────

interface TierAmbient {
  /** `halo` = pulsing radial glow, `ring` = rotating masked conic ring. */
  shape:     'halo' | 'ring';
  /** A keyframe already declared in globals.css. */
  animation: 'tier-soft-glow' | 'tier-rotate' | 'tier-rotate-reverse';
  /** Seconds. Slower than the equivalent current-tier effect. */
  duration:  number;
  /** Multiple of the icon size. */
  scale:     number;
  /** Peak alpha before the row's own dimming is applied. */
  alpha:     number;
  /**
   * `L C H` override for tiers whose own colour is too dark to read as motion
   * once the locked row's opacity is multiplied in. Defaults to `tier.color`.
   */
  tone?:     string;
}

/**
 * One ambient layer per tier, echoing that tier's signature from the full
 * stack — Steel glows, Obsidian rotates, Platinum counter-rotates, Singularity
 * spins fast, Apex pulses fast — so a locked row still reads as *that* tier.
 *
 * Deliberately excluded: `filter: blur()`, `mix-blend-mode`, card-wide sweep
 * bands and particle fleets. Those are what make the current-tier stack
 * expensive, and paying for them on every locked row is what this layer avoids.
 */
const TIER_AMBIENT: Record<string, TierAmbient> = {
  bronze:      { shape: 'halo', animation: 'tier-soft-glow',      duration: 7,   scale: 1.50, alpha: 0.34 },
  iron:        { shape: 'halo', animation: 'tier-soft-glow',      duration: 6.5, scale: 1.50, alpha: 0.36, tone: '0.70 0.05 255' },
  steel:       { shape: 'halo', animation: 'tier-soft-glow',      duration: 6,   scale: 1.55, alpha: 0.36 },
  obsidian:    { shape: 'ring', animation: 'tier-rotate',         duration: 18,  scale: 1.25, alpha: 0.60, tone: '0.62 0.18 290' },
  titan:       { shape: 'ring', animation: 'tier-rotate',         duration: 16,  scale: 1.30, alpha: 0.55 },
  platinum:    { shape: 'ring', animation: 'tier-rotate-reverse', duration: 15,  scale: 1.30, alpha: 0.50 },
  diamond:     { shape: 'ring', animation: 'tier-rotate',         duration: 14,  scale: 1.35, alpha: 0.55 },
  mythic:      { shape: 'ring', animation: 'tier-rotate',         duration: 13,  scale: 1.35, alpha: 0.60 },
  cosmic:      { shape: 'ring', animation: 'tier-rotate-reverse', duration: 12,  scale: 1.40, alpha: 0.60 },
  nebula:      { shape: 'halo', animation: 'tier-soft-glow',      duration: 4.5, scale: 1.70, alpha: 0.45, tone: '0.68 0.26 268' },
  singularity: { shape: 'ring', animation: 'tier-rotate',         duration: 6,   scale: 1.30, alpha: 0.65, tone: '0.85 0.16 265' },
  apex:        { shape: 'halo', animation: 'tier-soft-glow',      duration: 3.5, scale: 1.80, alpha: 0.50 },
};

const AMBIENT_FALLBACK: TierAmbient = {
  shape: 'halo', animation: 'tier-soft-glow', duration: 6, scale: 1.5, alpha: 0.35,
};

/** Ring cut-out. Both the standard and `-webkit-` property are set: without the
 *  prefixed one iOS Safari paints the conic gradient as a filled disc, which
 *  reads as a static blob rather than a turning ring. */
const AMBIENT_RING_MASK =
  'radial-gradient(closest-side, transparent 78%, black 80%, black 93%, transparent 95%)';

export function TierAmbientEffect({ tier, size }: { tier: Tier; size: number }) {
  const a = TIER_AMBIENT[tier.id] ?? AMBIENT_FALLBACK;
  const tone = a.tone ?? tier.color;

  if (a.shape === 'ring') {
    return (
      <Centered size={size * a.scale}>
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg,
              transparent 0deg,
              oklch(${tone} / ${a.alpha}) 110deg,
              oklch(${tone} / ${a.alpha * 0.45}) 200deg,
              transparent 280deg,
              transparent 360deg)`,
            animation: `${a.animation} ${a.duration}s linear infinite`,
            mask: AMBIENT_RING_MASK,
            WebkitMask: AMBIENT_RING_MASK,
          }}
        />
      </Centered>
    );
  }

  return (
    <Centered size={size * a.scale}>
      <div
        aria-hidden
        className="h-full w-full rounded-full"
        style={{
          background: `radial-gradient(circle, oklch(${tone} / ${a.alpha}) 0%, transparent 65%)`,
          animation: `${a.animation} ${a.duration}s ease-in-out infinite`,
        }}
      />
    </Centered>
  );
}

/**
 * Inline style for the icon bubble itself. The simple symmetric animations
 * (pulse/breathe/glow-shift) live here because they only animate the bubble.
 */
function iconBubbleStyle(tier: Tier, isStatic = false): React.CSSProperties {
  const accent = `oklch(${tier.color})`;
  const base: React.CSSProperties = {
    background: `oklch(${tier.color} / 0.18)`,
    color:      accent,
    boxShadow:  `inset 0 1px 0 oklch(${tier.color} / 0.3)`,
  };
  if (isStatic) return base;
  switch (tier.id) {
    case 'iron':
      return { ...base, animation: 'tier-pulse 3.5s ease-in-out infinite', transformOrigin: 'center' };
    case 'steel':
      return { ...base, animation: 'tier-breathe 3s ease-in-out infinite' };
    case 'titan':
      return {
        ...base,
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.55)`,
        ['--tier-glow-duration' as string]: '4s',
      };
    case 'nebula':
      return {
        ...base,
        animation: 'tier-soft-glow 2.5s ease-in-out infinite',
      };
    case 'singularity':
      return {
        ...base,
        animation: 'tier-pulse 2.5s ease-in-out infinite',
        boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.4), 0 0 25px -4px rgba(255,255,255,0.15)`,
      };
    case 'apex':
      return {
        ...base,
        animation: 'tier-breathe 1.8s ease-in-out infinite',
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.85)`,
        ['--tier-glow-duration' as string]: '2.5s',
      };
    default:
      return base;
  }
}

// ── Icon-back effects: rings + halos that sit BEHIND the icon ────────────────

function IconBackEffects({ tier, size }: { tier: Tier; size: number }) {
  const accent = `oklch(${tier.color})`;
  const halfSize = size / 2;

  switch (tier.id) {
    case 'steel':
      // Soft pulsing aura right around the icon
      return (
        <Centered size={size * 1.5}>
          <div
            className="h-full w-full rounded-full"
            style={{
              background: `radial-gradient(circle, oklch(${tier.color} / 0.35) 0%, transparent 60%)`,
              animation: 'tier-soft-glow 3.5s ease-in-out infinite',
            }}
          />
        </Centered>
      );

    case 'obsidian':
      // Slow rotating dark ring
      return (
        <Centered size={size * 1.2}>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg,
                transparent 0%, oklch(${tier.color} / 0.65) 25%, transparent 50%,
                transparent 75%, oklch(${tier.color} / 0.4) 90%, transparent 100%)`,
              animation: 'tier-rotate 12s linear infinite',
              mask: 'radial-gradient(closest-side, transparent 76%, black 78%, black 92%, transparent 94%)',
              WebkitMask: 'radial-gradient(closest-side, transparent 76%, black 78%, black 92%, transparent 94%)',
            }}
          />
        </Centered>
      );

    case 'titan': {
      // Golden corona: pulsing radial glow + slow rotating warm ring
      return (
        <>
          <Centered size={size * 1.9}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(0.86 0.14 80 / 0.45) 0%,
                  oklch(${tier.color} / 0.18) 40%,
                  transparent 70%)`,
                animation: 'tier-soft-glow 3.8s ease-in-out infinite',
                filter: 'blur(1px)',
              }}
            />
          </Centered>
          <Centered size={size * 1.3}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg,
                  oklch(0.92 0.15 80 / 0.7),
                  transparent 60%,
                  oklch(${tier.color} / 0.6),
                  transparent 100%)`,
                opacity: 0.55,
                animation: 'tier-rotate 11s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 78%, black 80%, black 92%, transparent 94%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 78%, black 80%, black 92%, transparent 94%)',
              }}
            />
          </Centered>
        </>
      );
    }

    case 'platinum': {
      // Double silver rings rotating in opposite directions
      return (
        <>
          <Centered size={size * 1.5}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle, oklch(0.95 0.02 210 / 0.30) 0%, transparent 65%)`,
                animation: 'tier-soft-glow 4s ease-in-out infinite',
              }}
            />
          </Centered>
          <Centered size={size * 1.25}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg,
                  oklch(0.95 0.03 210 / 0.6) 0deg, transparent 90deg,
                  oklch(0.92 0.02 210 / 0.5) 180deg, transparent 270deg, oklch(0.95 0.03 210 / 0.6) 360deg)`,
                opacity: 0.6,
                animation: 'tier-rotate 9s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 82%, black 84%, black 94%, transparent 96%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 82%, black 84%, black 94%, transparent 96%)',
              }}
            />
          </Centered>
          <Centered size={size * 1.45}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 180deg,
                  transparent 0deg, oklch(0.95 0.03 210 / 0.5) 90deg,
                  transparent 180deg, oklch(0.92 0.02 210 / 0.4) 270deg, transparent 360deg)`,
                opacity: 0.4,
                animation: 'tier-rotate-reverse 13s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 90%, black 92%, black 97%, transparent 99%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 90%, black 92%, black 97%, transparent 99%)',
              }}
            />
          </Centered>
        </>
      );
    }

    case 'diamond': {
      // Prismatic rotating ring + crystalline glow
      return (
        <>
          <Centered size={size * 1.7}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(0.92 0.14 195 / 0.45) 0%,
                  oklch(0.88 0.18 280 / 0.18) 40%,
                  transparent 70%)`,
                animation: 'tier-soft-glow 4s ease-in-out infinite',
                filter: 'blur(1px)',
              }}
            />
          </Centered>
          <Centered size={size * 1.35}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg,
                  oklch(0.88 0.20 195 / 0.7),
                  oklch(0.88 0.22 280 / 0.7),
                  oklch(0.88 0.20 340 / 0.7),
                  oklch(0.88 0.20 195 / 0.7))`,
                opacity: 0.55,
                animation: 'tier-rotate 9s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 78%, black 80%, black 92%, transparent 94%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 78%, black 80%, black 92%, transparent 94%)',
              }}
            />
          </Centered>
        </>
      );
    }

    case 'mythic': {
      // Magenta corona + slowly rotating conic gradient ring
      return (
        <>
          <Centered size={size * 1.9}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(${tier.color} / 0.55) 0%,
                  oklch(0.72 0.22 290 / 0.18) 40%,
                  transparent 70%)`,
                animation: 'tier-soft-glow 3.8s ease-in-out infinite',
                filter: 'blur(1px)',
              }}
            />
          </Centered>
          <Centered size={size * 1.45}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg,
                  oklch(${tier.color} / 0.7),
                  oklch(0.78 0.24 290 / 0.7),
                  oklch(${tier.color} / 0.7))`,
                opacity: 0.55,
                animation: 'tier-rotate 10s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 76%, black 78%, black 92%, transparent 94%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 76%, black 78%, black 92%, transparent 94%)',
              }}
            />
          </Centered>
        </>
      );
    }

    case 'cosmic': {
      // Full cosmic stack: multi-color corona + dual chromatic rings + radial pulses
      return (
        <>
          {/* Radial pulse waves emanating from the icon center */}
          <Centered size={size * 2.0}>
            <RadialRing color={`oklch(${tier.color} / 0.55)`} duration={4.5} delay={0} />
          </Centered>
          <Centered size={size * 2.0}>
            <RadialRing color={`oklch(0.85 0.22 200 / 0.50)`} duration={4.5} delay={1.5} />
          </Centered>
          <Centered size={size * 2.0}>
            <RadialRing color={`oklch(0.85 0.22 320 / 0.50)`} duration={4.5} delay={3.0} />
          </Centered>
          {/* Multi-color corona */}
          <Centered size={size * 1.8}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(${tier.color} / 0.45) 0%,
                  oklch(0.78 0.20 200 / 0.18) 50%,
                  transparent 75%)`,
                animation: 'tier-soft-glow 4s ease-in-out infinite',
                filter: 'blur(1px)',
              }}
            />
          </Centered>
          {/* Inner chromatic ring */}
          <Centered size={size * 1.35}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg,
                  oklch(0.88 0.22 50 / 0.7),
                  oklch(0.88 0.22 180 / 0.7),
                  oklch(0.88 0.22 320 / 0.7),
                  oklch(0.88 0.22 50 / 0.7))`,
                opacity: 0.6,
                animation: 'tier-rotate 10s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 76%, black 78%, black 90%, transparent 92%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 76%, black 78%, black 90%, transparent 92%)',
              }}
            />
          </Centered>
          {/* Outer counter-rotating ring */}
          <Centered size={size * 1.65}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 180deg,
                  oklch(0.95 0.22 320 / 0.5),
                  transparent 50%,
                  oklch(0.88 0.22 50 / 0.5),
                  transparent 100%)`,
                opacity: 0.45,
                animation: 'tier-rotate-reverse 14s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 88%, black 90%, black 96%, transparent 98%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 88%, black 90%, black 96%, transparent 98%)',
              }}
            />
          </Centered>
        </>
      );
    }

    case 'nebula': {
      // Bright pulsing indigo/purple glow — 2 layers, faster, more vibrant
      return (
        <>
          <Centered size={size * 2.2}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(0.72 0.26 270 / 0.55) 0%,
                  oklch(0.60 0.20 250 / 0.25) 30%,
                  transparent 65%
                )`,
                animation: 'tier-soft-glow 2.5s ease-in-out infinite',
                filter: 'blur(2px)',
              }}
            />
          </Centered>
          <Centered size={size * 1.4}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(0.78 0.28 280 / 0.45) 0%,
                  transparent 55%
                )`,
                animation: 'tier-breathe 2s ease-in-out infinite',
                filter: 'blur(1px)',
              }}
            />
          </Centered>
        </>
      );
    }

    case 'singularity': {
      // Deep void centre + bright, fast-rotating accretion ring
      return (
        <>
          <Centered size={size * 1.8}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(0.15 0.01 280 / 0.80) 0%,
                  oklch(0.10 0.01 280 / 0.40) 30%,
                  transparent 65%
                )`,
                animation: 'tier-soft-glow 3s ease-in-out infinite',
                filter: 'blur(1px)',
              }}
            />
          </Centered>
          <Centered size={size * 1.3}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg,
                  transparent 0deg,
                  oklch(0.85 0.20 260 / 0.8) 60deg,
                  oklch(0.90 0.22 290 / 1) 120deg,
                  oklch(0.80 0.18 240 / 0.6) 180deg,
                  transparent 210deg,
                  transparent 360deg
                )`,
                animation: 'tier-rotate 3s linear infinite',
                mask: 'radial-gradient(closest-side, transparent 78%, black 80%, black 94%, transparent 96%)',
                WebkitMask: 'radial-gradient(closest-side, transparent 78%, black 80%, black 94%, transparent 96%)',
              }}
            />
          </Centered>
        </>
      );
    }

    case 'apex': {
      // Brilliant solar gold — 2 bright layers pulsing fast
      return (
        <>
          <Centered size={size * 2.4}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(0.95 0.24 85 / 0.45) 0%,
                  oklch(0.88 0.18 80 / 0.20) 25%,
                  oklch(0.85 0.14 75 / 0.10) 50%,
                  transparent 75%
                )`,
                animation: 'tier-soft-glow 2s ease-in-out infinite',
                filter: 'blur(2px)',
              }}
            />
          </Centered>
          <Centered size={size * 1.5}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle,
                  oklch(0.98 0.22 85 / 0.55) 0%,
                  oklch(0.92 0.18 80 / 0.30) 30%,
                  transparent 60%
                )`,
                animation: 'tier-breathe 1.5s ease-in-out infinite',
                filter: 'blur(1px)',
              }}
            />
          </Centered>
        </>
      );
    }

    default:
      void halfSize; // not used in default path; here to silence linter for tiers without back effects
      void accent;
      return null;
  }
}

// ── Icon-front effects: cardinal sparkles, orbiting particles ────────────────

function IconFrontEffects({ tier, size, accent }: { tier: Tier; size: number; accent: string }) {
  switch (tier.id) {
    case 'diamond': {
      // 4 prismatic sparkles in cardinal positions around icon (N, E, S, W)
      const r = size * 0.7; // distance from center
      return (
        <>
          <CardinalSparkle dx={0}   dy={-r}  color="oklch(0.95 0.18 200 / 1)" duration={3.6} delay={0} />
          <CardinalSparkle dx={r}   dy={0}   color="oklch(0.95 0.22 280 / 1)" duration={3.6} delay={0.9} />
          <CardinalSparkle dx={0}   dy={r}   color="oklch(0.95 0.18 340 / 1)" duration={3.6} delay={1.8} />
          <CardinalSparkle dx={-r}  dy={0}   color="oklch(0.95 0.16 195 / 1)" duration={3.6} delay={2.7} />
        </>
      );
    }

    case 'mythic': {
      // 4 satellites orbiting at fixed radius
      return (
        <>
          {[0, 1.5, 3.0, 4.5].map((delay, i) => (
            <Orbit
              key={i}
              radius={size * 0.85}
              duration={9}
              delay={delay}
              startAngle={i * 90}
              color="oklch(0.95 0.22 330 / 0.95)"
              dotSize={4}
            />
          ))}
        </>
      );
    }

    case 'cosmic': {
      // 6 planets at 2 radii (3 inner, 3 outer), staggered
      const inner = size * 0.75;
      const outer = size * 1.05;
      return (
        <>
          <Orbit radius={inner} duration={8}  delay={0}   startAngle={0}   color="oklch(0.95 0.22 50 / 0.95)"  dotSize={5} />
          <Orbit radius={inner} duration={8}  delay={2.7} startAngle={120} color="oklch(0.95 0.22 180 / 0.95)" dotSize={5} />
          <Orbit radius={inner} duration={8}  delay={5.4} startAngle={240} color="oklch(0.95 0.22 320 / 0.95)" dotSize={5} />
          <Orbit radius={outer} duration={13} delay={0}   startAngle={60}  color="oklch(0.95 0.20 90 / 0.85)"  dotSize={3} reverse />
          <Orbit radius={outer} duration={13} delay={4.4} startAngle={180} color="oklch(0.95 0.20 230 / 0.85)" dotSize={3} reverse />
          <Orbit radius={outer} duration={13} delay={8.8} startAngle={300} color="oklch(0.95 0.22 290 / 0.85)" dotSize={3} reverse />
        </>
      );
    }

    case 'nebula': {
      // Drifting particle cloud — 8-10 small dots that float randomly,
      // not in orbit paths. Colour shifts between deep indigo, purple, blue.
      const particles = [
        { dx: 0, dy: -12, delay: 0, size: 4 },
        { dx: 14, dy: -6, delay: 0.8, size: 3 },
        { dx: 10, dy: 10, delay: 1.6, size: 3.5 },
        { dx: -8, dy: 8, delay: 2.4, size: 2.5 },
        { dx: -12, dy: -8, delay: 3.2, size: 3 },
        { dx: 16, dy: 2, delay: 4.0, size: 2.5 },
        { dx: -4, dy: -14, delay: 4.8, size: 3.5 },
        { dx: -16, dy: 4, delay: 5.6, size: 3 },
        { dx: 6, dy: -14, delay: 6.4, size: 2.5 },
        { dx: -10, dy: 12, delay: 7.2, size: 3 },
      ];
      const colors = [
        `oklch(0.70 0.22 260 / 0.9)`,
        `oklch(0.65 0.20 280 / 0.8)`,
        `oklch(0.75 0.18 240 / 0.9)`,
      ];
      return (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{ animation: 'tier-nebula-hue 12s ease-in-out infinite' }}
          >
            {particles.map((p, i) => (
              <span
                key={i}
                className="absolute rounded-full"
                style={{
                  left: '50%',
                  top: '50%',
                  width: p.size,
                  height: p.size,
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
                  background: colors[i % colors.length],
                  boxShadow: `0 0 ${p.size * 2}px 1px ${colors[i % colors.length]}`,
                  animation: `tier-nebula-drift ${6 + (i % 3) * 1.5}s ease-in-out infinite`,
                  animationDelay: `${p.delay}s`,
                }}
              />
            ))}
          </div>
        </>
      );
    }

    case 'singularity': {
      // Accretion disk effect — bright ring of material spiralling inward
      // toward a dark centre, with gravitational lensing glow around the edge.
      return (
        <>
          {/* Outer accretion ring — bright material spiralling inward */}
          <div
            className="pointer-events-none absolute"
            style={{
              left: '50%', top: '50%',
              width: size * 1.3, height: size * 1.3,
              marginLeft: -(size * 0.65), marginTop: -(size * 0.65),
              borderRadius: '50%',
              border: '2px solid transparent',
              background: `conic-gradient(from 0deg,
                oklch(0.65 0.08 280 / 0.9),
                oklch(0.85 0.12 250 / 0.7),
                oklch(0.70 0.10 260 / 0.9),
                oklch(0.90 0.14 240 / 0.8),
                oklch(0.65 0.08 280 / 0.9)
              )`,
              WebkitMask: 'radial-gradient(closest-side, transparent 40%, black 42%, black 70%, transparent 72%)',
              mask: 'radial-gradient(closest-side, transparent 40%, black 42%, black 70%, transparent 72%)',
              animation: 'tier-singularity-spiral 8s linear infinite',
              boxShadow: '0 0 30px 6px oklch(0.70 0.10 270 / 0.3)',
              filter: 'blur(1px)',
              willChange: 'transform',
            }}
          />
          {/* Inner accretion ring — faster, brighter, tighter */}
          <div
            className="pointer-events-none absolute"
            style={{
              left: '50%', top: '50%',
              width: size * 0.9, height: size * 0.9,
              marginLeft: -(size * 0.45), marginTop: -(size * 0.45),
              borderRadius: '50%',
              border: '1.5px solid transparent',
              background: `conic-gradient(from 0deg,
                oklch(0.90 0.14 250 / 0.9),
                oklch(0.95 0.18 240 / 0.6),
                oklch(0.85 0.12 270 / 0.8),
                oklch(0.90 0.14 250 / 0.9)
              )`,
              WebkitMask: 'radial-gradient(closest-side, transparent 55%, black 57%, black 80%, transparent 82%)',
              mask: 'radial-gradient(closest-side, transparent 55%, black 57%, black 80%, transparent 82%)',
              animation: 'tier-singularity-spiral 5s linear infinite reverse',
              boxShadow: '0 0 20px 4px oklch(0.85 0.12 260 / 0.4)',
              willChange: 'transform',
            }}
          />
          {/* Gravitational lensing glow — outer ring pulse */}
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: '50%', top: '50%',
              width: size * 1.6, height: size * 1.6,
              marginLeft: -(size * 0.8), marginTop: -(size * 0.8),
              background: `radial-gradient(circle,
                transparent 40%,
                oklch(0.60 0.06 280 / 0.15) 50%,
                oklch(0.70 0.08 260 / 0.08) 65%,
                transparent 80%
              )`,
              animation: 'tier-lensing-pulse 6s ease-in-out infinite',
            }}
          />
        </>
      );
    }

    case 'apex': {
      // Full corona burst — radiating rays of light from the icon,
      // brilliant gold pulse like a solar flare. Most visually impressive.
      const rayCount = 8;
      const rays = Array.from({ length: rayCount }, (_, i) => {
        const angle = (i / rayCount) * 360;
        const length = 0.8 + (i % 3) * 0.15;
        return { angle, length, delay: i * 0.3 };
      });
      return (
        <>
          {/* Outer solar glow */}
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: '50%', top: '50%',
              width: size * 2.2, height: size * 2.2,
              marginLeft: -(size * 1.1), marginTop: -(size * 1.1),
              background: `radial-gradient(circle,
                oklch(0.95 0.20 85 / 0.4) 0%,
                oklch(0.88 0.16 80 / 0.15) 30%,
                oklch(0.85 0.12 75 / 0.08) 55%,
                transparent 75%
              )`,
              animation: 'tier-solar-flare 4s ease-in-out infinite',
              filter: 'blur(2px)',
            }}
          />
          {/* Corona rays — radiating beams */}
          {rays.map((ray) => (
            <div
              key={ray.angle}
              className="pointer-events-none absolute"
              style={{
                left: '50%', top: '50%',
                width: 0, height: 0,
                transform: `rotate(${ray.angle}deg)`,
              }}
            >
              <div
                className="absolute"
                style={{
                  left: size * 0.35,
                  top: -2,
                  width: size * ray.length,
                  height: 4,
                  borderRadius: '50%',
                  background: `linear-gradient(90deg,
                    oklch(0.95 0.20 85 / 0.9),
                    oklch(0.90 0.16 75 / 0.4),
                    transparent
                  )`,
                  animation: 'tier-corona-ray 6s ease-in-out infinite',
                  animationDelay: `${ray.delay}s`,
                  filter: 'blur(1px)',
                }}
              />
            </div>
          ))}
          {/* Inner bright flare particles */}
          {[0, 1.2, 2.4, 3.6].map((delay) => (
            <span
              key={delay}
              className="pointer-events-none absolute rounded-full"
              style={{
                left: '50%', top: '50%',
                width: 4, height: 4,
                marginLeft: -2, marginTop: -2,
                background: 'oklch(0.98 0.22 85 / 1)',
                boxShadow: '0 0 12px 4px oklch(0.95 0.20 85 / 0.8)',
                animation: 'tier-spark-flash 3s ease-in-out infinite',
                animationDelay: `${delay}s`,
              }}
            />
          ))}
        </>
      );
    }

    default:
      void accent;
      return null;
  }
}

// ── Card-wide effects (base tints, edge glows, sweeps) ───────────────────────

/**
 * Effects that span the whole card. Intentionally minimal — most of the
 * "wow" lives around the icon via TierIcon. The card layer just sets the mood
 * via a subtle tint and, for higher tiers, a sweep or aurora.
 */
export function TierCardEffects({ tier }: { tier: Tier }) {
  switch (tier.id) {
    case 'bronze':
    case 'iron':
      return null;

    case 'steel':
      return (
        <div className="pointer-events-none absolute inset-0 rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.18), 0 0 14px -8px oklch(${tier.color} / 0.45)`,
              animation: 'tier-breathe 4.5s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'obsidian':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, oklch(${tier.color} / 0.12), transparent 70%)` }}
          />
        </div>
      );

    case 'titan':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 w-[200%]"
            style={{
              background: `linear-gradient(110deg, oklch(${tier.color} / 0.16), oklch(0.84 0.14 70 / 0.10), oklch(${tier.color} / 0.16))`,
              animation: 'tier-bg-cycle 7s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'platinum':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, oklch(0.92 0.02 210 / 0.10), transparent 70%)` }}
          />
          <SweepBand colorAlpha={0.22} duration={6} delay={0} />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(0.92 0.02 210 / 0.20), 0 0 18px -8px oklch(0.90 0.02 210 / 0.45)`,
              animation: 'tier-breathe 5.5s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'diamond':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, oklch(${tier.color} / 0.16), transparent 75%)` }}
          />
          <RainbowSweep duration={5.5} delay={0} />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.24), 0 0 20px -8px oklch(${tier.color} / 0.5)`,
              animation: 'tier-breathe 5s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'mythic':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 w-[200%]"
            style={{
              background: `linear-gradient(120deg,
                oklch(${tier.color} / 0.22),
                oklch(0.62 0.24 280 / 0.18),
                oklch(${tier.color} / 0.22))`,
              animation: 'tier-bg-cycle 6s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-0 mix-blend-screen"
            style={{
              background: `radial-gradient(ellipse at 70% 70%, oklch(0.78 0.22 320 / 0.12), transparent 60%)`,
              animation: 'tier-hue-cycle 9s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.28), 0 0 22px -8px oklch(${tier.color} / 0.55)`,
              animation: 'tier-breathe 5s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'cosmic':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 w-[200%]"
            style={{
              background: `linear-gradient(120deg,
                oklch(0.78 0.20 50 / 0.18),
                oklch(0.75 0.22 180 / 0.20),
                oklch(0.72 0.24 320 / 0.20),
                oklch(0.78 0.20 50 / 0.18))`,
              animation: 'tier-bg-hue-cycle 8s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.30), 0 0 26px -8px oklch(${tier.color} / 0.6)`,
              animation: 'tier-breathe 5s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'nebula':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 w-[200%]"
            style={{
              background: `linear-gradient(135deg, oklch(${tier.color} / 0.20), oklch(0.60 0.24 240 / 0.12), transparent 70%)`,
              animation: 'tier-bg-cycle 9s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.25), 0 0 24px -8px oklch(${tier.color} / 0.5)`,
              animation: 'tier-breathe 6s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'singularity':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, oklch(0.30 0.01 290 / 0.20), transparent 80%)`,
            }}
          />
          <SweepBand colorAlpha={0.08} duration={8} delay={0} />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(0.50 0.04 290 / 0.20), 0 0 20px -8px rgba(0,0,0,0.5)`,
              animation: 'tier-breathe 7s ease-in-out infinite',
            }}
          />
        </div>
      );

    case 'apex':
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 w-[200%]"
            style={{
              background: `linear-gradient(110deg,
                oklch(0.88 0.16 85 / 0.18),
                oklch(0.85 0.14 70 / 0.12),
                oklch(0.90 0.18 95 / 0.10),
                oklch(0.88 0.16 85 / 0.18))`,
              animation: 'tier-bg-cycle 5s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.35), 0 0 30px -8px oklch(${tier.color} / 0.6)`,
              animation: 'tier-breathe 4s ease-in-out infinite',
            }}
          />
        </div>
      );

    default:
      return null;
  }
}

// ── Reusable primitives ──────────────────────────────────────────────────────

/**
 * Wraps children in an absolutely-positioned, centered, fixed-size box anchored
 * to the parent's center. Used to place icon-relative effects relative to the
 * icon bubble center.
 */
function Centered({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        width: size, height: size,
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        // Don't clip children that need to escape the parent icon box; the
        // outer card has its own overflow:hidden, so anything beyond the card
        // gets clipped there.
      }}
    >
      {children}
    </div>
  );
}

/**
 * Sparkle positioned at a (dx, dy) offset from the icon center. Renders
 * absolutely with translate, then flashes via the spark-flash keyframe.
 */
function CardinalSparkle({
  dx, dy, color, duration, delay,
}: {
  dx: number; dy: number; color: string; duration: number; delay: number;
}) {
  return (
    <span
      className="pointer-events-none absolute h-1.5 w-1.5 rounded-full"
      style={{
        left: '50%',
        top:  '50%',
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
        background: color,
        boxShadow:  `0 0 8px 1px ${color}`,
        animation:  `tier-spark-flash ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        opacity: 0,
        willChange: 'transform, opacity',
      }}
    />
  );
}

/**
 * Orbit — a particle that rotates around the icon center at a fixed radius.
 * Uses a nested transform: outer wrapper rotates, inner span sits at offset.
 */
function Orbit({
  radius, duration, delay, startAngle, color, dotSize, reverse,
}: {
  radius: number; duration: number; delay: number; startAngle: number;
  color: string; dotSize: number; reverse?: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: '50%',
        top:  '50%',
        width: 0,
        height: 0,
        transform: `rotate(${startAngle}deg)`,
        animation: `${reverse ? 'tier-rotate-reverse' : 'tier-rotate'} ${duration}s linear infinite`,
        animationDelay: `${delay}s`,
      }}
    >
      <span
        className="absolute block rounded-full"
        style={{
          width: dotSize, height: dotSize,
          left: radius,
          top:  -dotSize / 2,
          background: color,
          boxShadow:  `0 0 6px 1px ${color}`,
        }}
      />
    </div>
  );
}

/**
 * Diagonal sweep band — transparent-bright-transparent gradient that translates
 * across the card. Opacity 0 at endpoints hides the wraparound.
 */
function SweepBand({ colorAlpha, duration, delay }: { colorAlpha: number; duration: number; delay: number }) {
  return (
    <div
      className="absolute -inset-y-2 w-2/5"
      style={{
        background: `linear-gradient(110deg, transparent 0%, oklch(1 0 0 / ${colorAlpha}) 50%, transparent 100%)`,
        transform: 'skewX(-14deg)',
        animation: `tier-sweep-x ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        willChange: 'transform, opacity',
      }}
    />
  );
}

/**
 * Rainbow refraction sweep — Diamond-specific gradient sweep band.
 */
function RainbowSweep({ duration, delay }: { duration: number; delay: number }) {
  return (
    <div
      className="absolute -inset-y-2 w-2/5"
      style={{
        background: `linear-gradient(110deg,
          transparent 0%,
          oklch(0.88 0.18 200 / 0.35) 30%,
          oklch(0.88 0.20 280 / 0.40) 50%,
          oklch(0.88 0.18 340 / 0.35) 70%,
          transparent 100%)`,
        transform: 'skewX(-14deg)',
        animation: `tier-sweep-x ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        willChange: 'transform, opacity',
      }}
    />
  );
}

/**
 * Radial ring — expanding outward from icon center, fading out. Used for the
 * cosmic radial-pulse wave effect.
 */
function RadialRing({ color, duration, delay }: { color: string; duration: number; delay: number }) {
  return (
    <div
      className="absolute inset-0 rounded-full"
      style={{
        border: `1.5px solid ${color}`,
        animation: `tier-radial-pulse ${duration}s ease-out infinite`,
        animationDelay: `${delay}s`,
        opacity: 0,
        willChange: 'transform, opacity',
      }}
    />
  );
}

// ── Legacy compatibility shims ───────────────────────────────────────────────
// Older call sites import these; keep no-op wrappers so we don't break anything
// mid-cutover. New code uses TierIcon + TierCardEffects directly.

export function tierIconStyle(tier: Tier): React.CSSProperties {
  return iconBubbleStyle(tier);
}

export function tierBackgroundStyle(_tier: Tier): React.CSSProperties {
  void _tier;
  return {};
}

export function TierOverlayEffects({ tier }: { tier: Tier }) {
  return <TierCardEffects tier={tier} />;
}
