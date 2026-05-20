'use client';

/**
 * Shared visual primitives for tier chips. Each tier has its own stacked
 * effect composition (TierEffects component) so the escalation Bronze → Cosmic
 * is meaningfully visible: more layers, more motion, more density as you climb.
 *
 * Design rules for animations declared in globals.css:
 *   - Either symmetric (0% === 100%) so no loop boundary
 *   - Or opacity-0 at both endpoints so the transform teleport is invisible
 *   - Pure transform + opacity (GPU-friendly, no layout thrash)
 *
 * Two surfaces consume this module: the home LevelChip and the /levels page
 * (CurrentTierCard + TierRow). Both render <TierEffects /> as the overlay
 * layer; the parent container provides `position: relative` and
 * `overflow: hidden`.
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

// ── Icon bubble inline style ─────────────────────────────────────────────────

/**
 * Style applied to the icon bubble (the small rounded square holding the
 * Lucide icon). Pulse/breathe/glow-shift live HERE because they only animate
 * the icon. Card-level effects all live in <TierEffects />.
 */
export function tierIconStyle(tier: Tier): React.CSSProperties {
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
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.45)`,
      };
    default:
      return base;
  }
}

// ── Card-level effects ───────────────────────────────────────────────────────

interface TierEffectsProps {
  tier: Tier;
}

/**
 * Renders the tier's full visual stack as absolutely-positioned overlays.
 * The parent container must be `position: relative` + `overflow: hidden`.
 */
export function TierEffects({ tier }: TierEffectsProps) {
  switch (tier.id) {
    case 'bronze':   return null;
    case 'iron':     return null; // icon-only effect, handled by tierIconStyle
    case 'steel':    return <SteelEffects tier={tier} />;
    case 'obsidian': return <ObsidianEffects tier={tier} />;
    case 'titan':    return <TitanEffects tier={tier} />;
    case 'platinum': return <PlatinumEffects tier={tier} />;
    case 'diamond':  return <DiamondEffects tier={tier} />;
    case 'mythic':   return <MythicEffects tier={tier} />;
    case 'cosmic':   return <CosmicEffects tier={tier} />;
    default:         return null;
  }
}

// ── Tier 3 · Steel ───────────────────────────────────────────────────────────
// Soft pulsing border-glow ring. Icon already breathes via tierIconStyle.

function SteelEffects({ tier }: { tier: Tier }) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-2xl" aria-hidden>
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.20), 0 0 18px -8px oklch(${tier.color} / 0.5)`,
          animation: 'tier-breathe 4.5s ease-in-out infinite',
        }}
      />
    </div>
  );
}

// ── Tier 4 · Obsidian ────────────────────────────────────────────────────────
// Diagonal light glint sweep + dim base tint + one slow spark.

function ObsidianEffects({ tier }: { tier: Tier }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {/* Subtle base tint */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, oklch(${tier.color} / 0.08), transparent 70%)` }}
      />
      {/* Glint sweep */}
      <SweepBand
        colorAlpha={0.22}
        duration={6.5}
        delay={0}
        skewDeg={-18}
      />
      {/* Single sparkle */}
      <Sparkle x={0.78} y={0.32} color={`oklch(${tier.color} / 0.95)`} duration={5.5} delay={2.2} />
    </div>
  );
}

// ── Tier 5 · Titan ───────────────────────────────────────────────────────────
// Hue-shifting warm overlay + halo behind icon + 2 sparkles.

function TitanEffects({ tier }: { tier: Tier }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {/* Warm gradient with slow hue oscillation */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(120deg, oklch(${tier.color} / 0.14), oklch(0.82 0.14 60 / 0.10), oklch(${tier.color} / 0.14))`,
          backgroundSize: '200% 100%',
          animation: 'tier-bg-cycle 7s ease-in-out infinite, tier-hue-cycle 6s ease-in-out infinite',
        }}
      />
      {/* Soft halo behind icon position (top-left area) */}
      <Halo cx="20%" cy="50%" color={`oklch(${tier.color} / 0.55)`} size={68} duration={3.6} />
      <Sparkle x={0.62} y={0.28} color={`oklch(0.92 0.14 60 / 0.95)`} duration={4.5} delay={0.4} />
      <Sparkle x={0.82} y={0.68} color={`oklch(${tier.color} / 0.95)`} duration={5.0} delay={2.1} />
    </div>
  );
}

// ── Tier 6 · Platinum ────────────────────────────────────────────────────────
// Two staggered shimmer sweeps so the card always has motion + edge glow + sparkles.

function PlatinumEffects({ tier }: { tier: Tier }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {/* Pearl base */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, oklch(0.92 0.02 210 / 0.10), transparent 80%)` }}
      />
      {/* Two sweeps, second offset by 3s so the card never sits idle */}
      <SweepBand colorAlpha={0.30} duration={5.5} delay={0} skewDeg={-14} />
      <SweepBand colorAlpha={0.20} duration={5.5} delay={2.75} skewDeg={-14} />
      {/* Edge glow */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          boxShadow: `inset 0 0 0 1px oklch(0.92 0.02 210 / 0.22), 0 0 24px -6px oklch(0.90 0.02 210 / 0.55)`,
          animation: 'tier-breathe 5s ease-in-out infinite',
        }}
      />
      <Sparkle x={0.30} y={0.30} color="oklch(0.95 0.04 210 / 0.95)" duration={4.5} delay={0.6} />
      <Sparkle x={0.85} y={0.60} color="oklch(0.95 0.04 210 / 0.95)" duration={4.5} delay={2.4} />
    </div>
  );
}

// ── Tier 7 · Diamond ─────────────────────────────────────────────────────────
// Rainbow refraction sweep + rotating prism ring around icon + 4 sparkles + edge.

function DiamondEffects({ tier }: { tier: Tier }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {/* Ice base */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, oklch(${tier.color} / 0.14), transparent 75%)` }}
      />
      {/* Refraction band — rainbow gradient sweeping */}
      <div
        className="absolute -inset-y-2 w-2/5"
        style={{
          background: `linear-gradient(110deg,
            transparent 0%,
            oklch(0.88 0.18 200 / 0.40) 30%,
            oklch(0.88 0.20 280 / 0.45) 50%,
            oklch(0.88 0.18 340 / 0.40) 70%,
            transparent 100%)`,
          transform: 'skewX(-14deg)',
          animation: 'tier-sweep-x 5s ease-in-out infinite',
          willChange: 'transform, opacity',
        }}
      />
      {/* Prism ring behind icon position — slow rotate */}
      <div
        className="absolute"
        style={{
          left: '20%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 64, height: 64,
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg,
              oklch(0.88 0.20 200 / 0.6),
              oklch(0.88 0.22 280 / 0.6),
              oklch(0.88 0.20 340 / 0.6),
              oklch(0.88 0.20 200 / 0.6))`,
            opacity: 0.35,
            animation: 'tier-rotate 9s linear infinite',
            mask: 'radial-gradient(closest-side, transparent 64%, black 66%, black 78%, transparent 80%)',
            WebkitMask: 'radial-gradient(closest-side, transparent 64%, black 66%, black 78%, transparent 80%)',
          }}
        />
      </div>
      {/* Edge glow */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          boxShadow: `inset 0 0 0 1px oklch(${tier.color} / 0.28), 0 0 26px -6px oklch(${tier.color} / 0.55)`,
          animation: 'tier-breathe 5s ease-in-out infinite',
        }}
      />
      {/* 4 sparkles, staggered */}
      <Sparkle x={0.40} y={0.22} color="oklch(0.95 0.18 200 / 0.95)" duration={3.6} delay={0} />
      <Sparkle x={0.65} y={0.72} color="oklch(0.95 0.20 280 / 0.95)" duration={3.6} delay={0.9} />
      <Sparkle x={0.86} y={0.30} color="oklch(0.95 0.18 340 / 0.95)" duration={3.6} delay={1.8} />
      <Sparkle x={0.55} y={0.85} color="oklch(0.95 0.16 195 / 0.95)" duration={3.6} delay={2.7} />
    </div>
  );
}

// ── Tier 8 · Mythic ──────────────────────────────────────────────────────────
// Magenta gradient cycle + aurora overlay + halo + 5 sparkles + rotating edge.

function MythicEffects({ tier }: { tier: Tier }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {/* Magenta gradient cycle */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(120deg,
            oklch(${tier.color} / 0.26),
            oklch(0.62 0.24 280 / 0.22),
            oklch(${tier.color} / 0.26))`,
          backgroundSize: '220% 100%',
          animation: 'tier-bg-cycle 6s ease-in-out infinite',
        }}
      />
      {/* Aurora overlay — slow hue cycle on a second gradient */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background: `radial-gradient(ellipse at 30% 30%, oklch(0.78 0.22 320 / 0.18), transparent 60%),
                       radial-gradient(ellipse at 80% 80%, oklch(0.72 0.22 280 / 0.20), transparent 60%)`,
          animation: 'tier-hue-cycle 8s ease-in-out infinite',
        }}
      />
      {/* Rotating conic edge band */}
      <div
        className="absolute -inset-1 rounded-2xl"
        style={{
          background: `conic-gradient(from 0deg,
            transparent 0deg,
            oklch(${tier.color} / 0.45) 60deg,
            transparent 120deg,
            transparent 240deg,
            oklch(0.78 0.22 280 / 0.45) 300deg,
            transparent 360deg)`,
          animation: 'tier-conic-rotate 14s linear infinite',
          opacity: 0.55,
          mask: 'linear-gradient(#fff, #fff) content-box, linear-gradient(#fff, #fff)',
          WebkitMask: 'linear-gradient(#fff, #fff) content-box, linear-gradient(#fff, #fff)',
          maskComposite: 'exclude',
          WebkitMaskComposite: 'xor',
          padding: 1.5,
        }}
      />
      {/* Halo behind icon */}
      <Halo cx="20%" cy="50%" color={`oklch(${tier.color} / 0.6)`} size={70} duration={3.2} />
      {/* 5 sparks scattered, staggered timings */}
      <Sparkle x={0.35} y={0.22} color={`oklch(0.92 0.22 330 / 1)`} duration={3.4} delay={0} />
      <Sparkle x={0.60} y={0.72} color={`oklch(0.85 0.22 290 / 1)`} duration={3.4} delay={0.7} />
      <Sparkle x={0.82} y={0.30} color={`oklch(0.92 0.20 330 / 1)`} duration={3.4} delay={1.5} />
      <Sparkle x={0.48} y={0.50} color={`oklch(0.90 0.22 320 / 1)`} duration={3.4} delay={2.2} />
      <Sparkle x={0.72} y={0.18} color={`oklch(0.92 0.22 300 / 1)`} duration={3.4} delay={3.0} />
    </div>
  );
}

// ── Tier 9 · Cosmic ──────────────────────────────────────────────────────────
// Full holographic gradient + counter-rotating chromatic ring + radial pulse
// + 6 orbiting particles + sparkles + edge aurora.

function CosmicEffects({ tier }: { tier: Tier }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {/* Holographic base */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(120deg,
            oklch(0.78 0.20 50 / 0.20),
            oklch(0.75 0.22 180 / 0.22),
            oklch(0.72 0.24 320 / 0.22),
            oklch(0.78 0.20 50 / 0.20))`,
          backgroundSize: '300% 300%',
          animation: 'tier-bg-hue-cycle 7s ease-in-out infinite',
        }}
      />
      {/* Radial pulse rings — three offset for continuous wave feel */}
      <RadialPulse cx="20%" cy="50%" color={`oklch(${tier.color} / 0.5)`} duration={4.5} delay={0} />
      <RadialPulse cx="20%" cy="50%" color={`oklch(0.85 0.20 200 / 0.45)`} duration={4.5} delay={1.5} />
      <RadialPulse cx="20%" cy="50%" color={`oklch(0.85 0.22 320 / 0.45)`} duration={4.5} delay={3.0} />
      {/* Counter-rotating chromatic ring around icon */}
      <div
        className="absolute"
        style={{
          left: '20%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 76, height: 76,
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg,
              oklch(0.85 0.22 50 / 0.6),
              oklch(0.85 0.22 180 / 0.6),
              oklch(0.85 0.22 320 / 0.6),
              oklch(0.85 0.22 50 / 0.6))`,
            opacity: 0.5,
            animation: 'tier-rotate 10s linear infinite',
            mask: 'radial-gradient(closest-side, transparent 70%, black 72%, black 82%, transparent 84%)',
            WebkitMask: 'radial-gradient(closest-side, transparent 70%, black 72%, black 82%, transparent 84%)',
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 180deg,
              oklch(0.95 0.22 320 / 0.55),
              transparent,
              oklch(0.85 0.22 50 / 0.55),
              transparent)`,
            opacity: 0.45,
            animation: 'tier-rotate-reverse 8s linear infinite',
            mask: 'radial-gradient(closest-side, transparent 84%, black 86%, black 92%, transparent 94%)',
            WebkitMask: 'radial-gradient(closest-side, transparent 84%, black 86%, black 92%, transparent 94%)',
          }}
        />
      </div>
      {/* 6 orbiting particles around icon */}
      {[
        { delay: 0,   radius: 32, color: 'oklch(0.95 0.20 50  / 0.85)' },
        { delay: 1.2, radius: 32, color: 'oklch(0.95 0.20 180 / 0.85)' },
        { delay: 2.4, radius: 32, color: 'oklch(0.95 0.22 320 / 0.85)' },
        { delay: 0.6, radius: 44, color: 'oklch(0.95 0.20 90  / 0.7)'  },
        { delay: 1.8, radius: 44, color: 'oklch(0.95 0.20 230 / 0.7)'  },
        { delay: 3.0, radius: 44, color: 'oklch(0.95 0.22 290 / 0.7)'  },
      ].map((p, i) => (
        <OrbitParticle
          key={i}
          cx="20%" cy="50%"
          color={p.color}
          radius={p.radius}
          duration={10 + (i % 3)}
          delay={p.delay}
        />
      ))}
      {/* Sparkles */}
      <Sparkle x={0.55} y={0.20} color="oklch(0.95 0.20 50 / 1)"  duration={3.0} delay={0} />
      <Sparkle x={0.78} y={0.50} color="oklch(0.95 0.20 200 / 1)" duration={3.0} delay={1.0} />
      <Sparkle x={0.62} y={0.78} color="oklch(0.95 0.22 320 / 1)" duration={3.0} delay={2.0} />
    </div>
  );
}

// ── Primitive effect components ──────────────────────────────────────────────

/**
 * Sweep band — diagonal light gradient that translates across the card.
 * The element is opacity 0 at both endpoints so the keyframe wraparound is
 * invisible. Used by Obsidian/Platinum.
 */
function SweepBand({
  colorAlpha,
  duration,
  delay,
  skewDeg = -14,
}: {
  colorAlpha: number;
  duration:   number;
  delay:      number;
  skewDeg?:   number;
}) {
  return (
    <div
      className="absolute -inset-y-2 w-2/5"
      style={{
        background: `linear-gradient(110deg, transparent 0%, oklch(1 0 0 / ${colorAlpha}) 50%, transparent 100%)`,
        transform: `skewX(${skewDeg}deg)`,
        animation: `tier-sweep-x ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        willChange: 'transform, opacity',
      }}
    />
  );
}

/**
 * Sparkle — small dot that briefly flashes bright. Opacity 0 at loop boundary.
 */
function Sparkle({
  x, y, color, duration, delay,
}: {
  x: number; y: number; color: string; duration: number; delay: number;
}) {
  return (
    <span
      className="absolute h-1 w-1 rounded-full"
      style={{
        left: `${x * 100}%`,
        top:  `${y * 100}%`,
        background: color,
        boxShadow:  `0 0 6px 1px ${color}`,
        animation:  `tier-spark-flash ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        opacity: 0,
        willChange: 'transform, opacity',
      }}
    />
  );
}

/**
 * Halo — soft pulsing glow circle behind the icon. Symmetric scale/opacity.
 */
function Halo({
  cx, cy, color, size, duration,
}: {
  cx: string; cy: string; color: string; size: number; duration: number;
}) {
  return (
    <div
      className="absolute rounded-full blur-[6px]"
      style={{
        left: cx, top: cy,
        width: size, height: size,
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        animation: `tier-soft-glow ${duration}s ease-in-out infinite`,
        willChange: 'transform, opacity',
      }}
    />
  );
}

/**
 * Radial pulse — expanding circle that fades out. Opacity 0 at start/end so
 * the wraparound is invisible.
 */
function RadialPulse({
  cx, cy, color, duration, delay,
}: {
  cx: string; cy: string; color: string; duration: number; delay: number;
}) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: cx, top: cy,
        width: 50, height: 50,
        transform: 'translate(-50%, -50%)',
        border: `1.5px solid ${color}`,
        animation: `tier-radial-pulse ${duration}s ease-out infinite`,
        animationDelay: `${delay}s`,
        opacity: 0,
        willChange: 'transform, opacity',
      }}
    />
  );
}

/**
 * Orbit particle — small dot that orbits a center point at a given radius.
 * Uses CSS custom property to parametrize radius for the shared keyframe.
 */
function OrbitParticle({
  cx, cy, color, radius, duration, delay,
}: {
  cx: string; cy: string; color: string; radius: number; duration: number; delay: number;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: cx, top: cy,
        width: 0, height: 0,
      }}
    >
      <span
        className="absolute block h-1 w-1 rounded-full"
        style={{
          background: color,
          boxShadow: `0 0 6px 1px ${color}`,
          transformOrigin: '0 0',
          ['--tier-orbit-radius' as string]: `${radius}px`,
          animation: `tier-orbit ${duration}s linear infinite`,
          animationDelay: `${delay}s`,
          willChange: 'transform',
        }}
      />
    </div>
  );
}

// ── Legacy shim ──────────────────────────────────────────────────────────────
// Some call-sites still import these; keep no-op shims so we don't break them
// during the cutover. Both now return null styles / null components since
// TierEffects above replaces them entirely.

export function tierBackgroundStyle(_tier: Tier): React.CSSProperties {
  void _tier;
  return {};
}

export function TierOverlayEffects({ tier }: { tier: Tier }) {
  return <TierEffects tier={tier} />;
}
