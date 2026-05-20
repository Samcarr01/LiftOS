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
  type LucideIcon,
} from 'lucide-react';
import type { Tier, TierIcon as TierIconName } from './xp';

export const TIER_ICON_MAP: Record<TierIconName, LucideIcon> = {
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

// ── TierIcon: icon + icon-centric effects ────────────────────────────────────

interface TierIconProps {
  tier: Tier;
  /** Icon bubble side length in px. */
  size: number;
}

/**
 * The icon bubble, with all icon-relative effects (rings, halos, orbits,
 * cardinal sparkles) layered around it. The wrapper is sized to the icon
 * exactly so the parent flex layout is unaffected; effect children use
 * absolute positioning relative to the bubble center so they can extend
 * outside without breaking layout.
 */
export function TierIcon({ tier, size }: TierIconProps) {
  const Icon = TIER_ICON_MAP[tier.icon];
  const iconPx = Math.round(size * 0.5);
  const accent = `oklch(${tier.color})`;

  // Back layer container: same size as icon, centered effects can use
  // negative inset to extend out without affecting layout
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      {/* Effects BEHIND the icon (rings, halos, base glow) */}
      <IconBackEffects tier={tier} size={size} />

      {/* Icon bubble itself */}
      <div
        className="relative z-10 flex h-full w-full items-center justify-center rounded-xl"
        style={iconBubbleStyle(tier)}
      >
        <Icon style={{ width: iconPx, height: iconPx }} strokeWidth={1.8} />
      </div>

      {/* Effects IN FRONT (sparkles in cardinal positions, foreground orbits) */}
      <IconFrontEffects tier={tier} size={size} accent={accent} />
    </div>
  );
}

/**
 * Inline style for the icon bubble itself. The simple symmetric animations
 * (pulse/breathe/glow-shift) live here because they only animate the bubble.
 */
function iconBubbleStyle(tier: Tier): React.CSSProperties {
  const accent = `oklch(${tier.color})`;
  const base: React.CSSProperties = {
    background: `oklch(${tier.color} / 0.18)`,
    color:      accent,
    boxShadow:  `inset 0 1px 0 oklch(${tier.color} / 0.3)`,
  };
  switch (tier.id) {
    case 'iron':
      return { ...base, animation: 'tier-pulse 3.5s ease-in-out infinite', transformOrigin: 'center' };
    case 'steel':
      return { ...base, animation: 'tier-breathe 3s ease-in-out infinite' };
    case 'titan':
      return {
        ...base,
        animation: 'tier-glow-shift 4s ease-in-out infinite',
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.55)`,
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
            className="absolute inset-0"
            style={{
              background: `linear-gradient(110deg, oklch(${tier.color} / 0.16), oklch(0.84 0.14 70 / 0.10), oklch(${tier.color} / 0.16))`,
              backgroundSize: '220% 100%',
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
            className="absolute inset-0"
            style={{
              background: `linear-gradient(120deg,
                oklch(${tier.color} / 0.22),
                oklch(0.62 0.24 280 / 0.18),
                oklch(${tier.color} / 0.22))`,
              backgroundSize: '220% 100%',
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
            className="absolute inset-0"
            style={{
              background: `linear-gradient(120deg,
                oklch(0.78 0.20 50 / 0.18),
                oklch(0.75 0.22 180 / 0.20),
                oklch(0.72 0.24 320 / 0.20),
                oklch(0.78 0.20 50 / 0.18))`,
              backgroundSize: '300% 300%',
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
          willChange: 'transform',
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
