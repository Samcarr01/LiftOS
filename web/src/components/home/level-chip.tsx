'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { resolveLevelFromStoredProgress } from '@/lib/leveling/xp';
import {
  TierIcon,
  TierCardEffects,
} from '@/lib/leveling/tier-visuals';

interface LevelChipProps {
  xpTotal: number;
  xpLevel: number;
}

export function LevelChip({ xpTotal, xpLevel }: LevelChipProps) {
  const { tier, level, progressPct, total, intoLevel, nextLevelAt } = useMemo(() => {
    // Level and tier come from the same resolved state, so the chip can never
    // pair a stale persisted level with the canonical XP total.
    const ls = resolveLevelFromStoredProgress({ xpTotal, xpLevel });
    return {
      tier:        ls.tier,
      level:       ls.level,
      progressPct: ls.progressPct,
      total:       xpTotal,
      intoLevel:   ls.xpIntoLevel,
      nextLevelAt: ls.xpAtNextLevel - ls.xpAtLevel,
    };
  }, [xpLevel, xpTotal]);

  const accent = `oklch(${tier.color})`;
  const remaining = Math.max(0, nextLevelAt - intoLevel);

  return (
    <Link
      href="/levels"
      className="action-card group relative block overflow-hidden rounded-2xl px-4 py-3.5 transition-transform duration-150 active:scale-[0.995]"
      style={{
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.4)`,
      }}
    >
      {/* Card-wide effects (base tints, edge glows, sweep bands) */}
      <TierCardEffects tier={tier} />

      <div className="relative flex items-center gap-3">
        <TierIcon tier={tier} size={40} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-sm font-bold uppercase tracking-[0.12em]"
              style={{ color: accent }}
            >
              {tier.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">Level {level}</span>
            <span className="ml-auto text-xs font-medium tabular-nums" style={{ color: accent }}>
              {remaining.toLocaleString()} XP to go
            </span>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full w-full origin-left rounded-full transition-transform duration-500 ease-out"
              style={{
                transform: `scaleX(${Math.max(0.02, progressPct)})`,
                background: `linear-gradient(90deg, oklch(${tier.color} / 0.6), ${accent})`,
                boxShadow: `0 0 8px oklch(${tier.color} / 0.5)`,
              }}
            />
          </div>
        </div>

        <ChevronRight
          className="ml-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>

      <div className="relative mt-2 flex justify-between text-[10px] text-muted-foreground/50 tabular-nums">
        <span>Level {level} → {level + 1}</span>
        <span>{total.toLocaleString()} XP total</span>
      </div>
    </Link>
  );
}
