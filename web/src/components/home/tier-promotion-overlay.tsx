'use client';

/**
 * Full-screen tier-promotion reveal. Plays once when the user crosses into a
 * new tier on workout-complete. Dismisses on tap or after a timeout.
 *
 * Visuals: dim/blur backdrop in the new tier's accent color, large icon
 * zoom-in, "PROMOTED" overline, big tier name with a per-tier animation
 * applied as the background, level subtitle. Confetti fires once for the
 * higher-impact tiers (Diamond+).
 */

import { useEffect, useRef } from 'react';
import {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
  type LucideIcon,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Tier, TierIcon } from '@/lib/leveling/xp';

const ICON_MAP: Record<TierIcon, LucideIcon> = {
  Medal, Hammer, Shield, Mountain, Atom, Star, Gem, Sparkles, Crown,
};

interface TierPromotionOverlayProps {
  toTier:   Tier;
  newLevel: number;
  onDismiss: () => void;
  /** Auto-dismiss after this many ms. Default 3800ms (long enough to read + breathe). */
  autoDismissMs?: number;
}

const PARTICLE_TIERS = new Set(['diamond', 'mythic', 'cosmic']);

export function TierPromotionOverlay({
  toTier,
  newLevel,
  onDismiss,
  autoDismissMs = 3800,
}: TierPromotionOverlayProps) {
  const Icon = ICON_MAP[toTier.icon];
  const accent = `oklch(${toTier.color})`;
  const firedConfetti = useRef(false);

  // Auto-dismiss timer
  useEffect(() => {
    const t = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(t);
  }, [onDismiss, autoDismissMs]);

  // Confetti only for the showstopping tiers
  useEffect(() => {
    if (firedConfetti.current) return;
    if (!PARTICLE_TIERS.has(toTier.id)) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    firedConfetti.current = true;
    const t = window.setTimeout(() => {
      confetti({
        particleCount: 140,
        spread: 90,
        origin: { x: 0.5, y: 0.35 },
        colors: confettiColorsForTier(toTier.id),
        ticks: 260,
        gravity: 0.9,
        scalar: 1.0,
        disableForReducedMotion: true,
      });
    }, 320);
    return () => window.clearTimeout(t);
  }, [toTier.id]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center px-6"
      style={{
        background: `radial-gradient(circle at 50% 35%, oklch(${toTier.color} / 0.30) 0%, oklch(0.10 0 0 / 0.92) 60%, oklch(0.06 0 0 / 0.98) 100%)`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        animation: 'fade-up 240ms ease-out',
      }}
    >
      {/* Icon */}
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full"
        style={{
          background: `oklch(${toTier.color} / 0.20)`,
          color: accent,
          boxShadow:
            `0 0 60px -8px oklch(${toTier.color} / 0.55), ` +
            `inset 0 1px 0 oklch(${toTier.color} / 0.4)`,
          animation: 'tier-icon-zoom 720ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <Icon className="h-14 w-14" strokeWidth={1.8} />
      </div>

      {/* PROMOTED overline */}
      <p
        className="mt-6 text-xs font-bold uppercase tracking-[0.32em] text-white/55"
        style={{ animation: 'fade-up 700ms 320ms ease-out both' }}
      >
        Promoted
      </p>

      {/* Tier name — big, with per-tier animation as the fill */}
      <h1
        className="mt-2 bg-clip-text font-display text-5xl font-bold uppercase tracking-tight text-transparent"
        style={{
          backgroundImage: tierNameGradient(toTier),
          backgroundSize: '200% 100%',
          animation:
            `tier-name-reveal 800ms 360ms cubic-bezier(0.16, 1, 0.3, 1) both, ` +
            `${tierNameAnimation(toTier)}`,
        }}
      >
        {toTier.name}
      </h1>

      {/* Level subtitle */}
      <p
        className="mt-3 text-base font-semibold tabular-nums text-white/70"
        style={{ animation: 'fade-up 700ms 700ms ease-out both' }}
      >
        Level {newLevel}
      </p>

      {/* Tap hint */}
      <p
        className="absolute bottom-10 text-xs uppercase tracking-[0.28em] text-white/35"
        style={{ animation: 'fade-up 700ms 1400ms ease-out both' }}
      >
        Tap to continue
      </p>
    </div>
  );
}

// ── Per-tier visual helpers ──────────────────────────────────────────────────

function tierNameGradient(tier: Tier): string {
  switch (tier.id) {
    case 'diamond':
      return `linear-gradient(110deg, oklch(0.92 0.10 220), oklch(0.85 0.16 200), oklch(0.88 0.14 280), oklch(0.92 0.10 220))`;
    case 'mythic':
      return `linear-gradient(110deg, oklch(${tier.color}), oklch(0.78 0.22 280), oklch(${tier.color}))`;
    case 'cosmic':
      return `linear-gradient(110deg, oklch(0.85 0.18 50), oklch(0.80 0.20 180), oklch(0.78 0.22 320), oklch(0.85 0.18 50))`;
    default:
      return `linear-gradient(110deg, oklch(${tier.color}), oklch(${tier.color} / 0.85), oklch(${tier.color}))`;
  }
}

function tierNameAnimation(tier: Tier): string {
  switch (tier.id) {
    case 'platinum': return 'tier-shimmer 3.5s linear infinite 1.1s';
    case 'diamond':  return 'tier-refract 3.5s linear infinite 1.1s';
    case 'mythic':   return 'tier-gradient-cycle 5s ease-in-out infinite 1.1s';
    case 'cosmic':   return 'tier-holographic 6s ease-in-out infinite 1.1s';
    default:         return 'none';
  }
}

function confettiColorsForTier(id: string): string[] {
  switch (id) {
    case 'diamond': return ['#A5F3FC', '#67E8F9', '#CFFAFE', '#FFFFFF'];
    case 'mythic':  return ['#D8B4FE', '#F0ABFC', '#A78BFA', '#FBCFE8'];
    case 'cosmic':  return ['#FDE68A', '#FCA5A5', '#A5B4FC', '#86EFAC', '#F9A8D4'];
    default:        return ['#FFFFFF'];
  }
}
