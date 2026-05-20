'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Check, Lock, Loader2,
  Dumbbell, Trophy, Target, Award,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  computeXp, levelFromXp, tierForLevel, xpForLevel,
  TIERS,
  XP_PER_SESSION, XP_PER_LIGHT_SESSION, XP_PER_TARGET_HIT, XP_PER_PR_BONUS,
  type Tier, type XpInputSession, type XpInputPR, type XpBreakdown,
} from '@/lib/leveling/xp';
import {
  TIER_DESCRIPTIONS,
  TierIcon,
  TierCardEffects,
} from '@/lib/leveling/tier-visuals';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LevelsPage() {
  const [state, setState] = useState<{
    breakdown: XpBreakdown;
    level:     number;
    tier:      Tier;
    intoLevel: number;
    nextLevelAt: number;
    progressPct: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [usersRes, sessionsRes, prsRes] = await Promise.all([
        supabase.from('users').select('weekly_workout_target').single(),
        supabase
          .from('workout_sessions')
          .select('id, started_at, is_light_session')
          .not('completed_at', 'is', null),
        supabase.from('personal_records').select('session_id'),
      ]);

      if (cancelled) return;

      const weeklyTarget =
        (usersRes.data as { weekly_workout_target: number | null } | null)
          ?.weekly_workout_target ?? 4;
      const sessions = (sessionsRes.data ?? []) as XpInputSession[];
      const prs      = (prsRes.data ?? [])      as XpInputPR[];

      const breakdown = computeXp(sessions, prs, weeklyTarget);
      const ls = levelFromXp(breakdown.total);
      setState({
        breakdown,
        level:       ls.level,
        tier:        tierForLevel(ls.level),
        intoLevel:   ls.xpIntoLevel,
        nextLevelAt: ls.xpAtNextLevel - ls.xpAtLevel,
        progressPct: ls.progressPct,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-6">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Home
        </Link>

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold">Levels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nine tiers from Bronze to Cosmic. Earn XP for showing up, hitting
            your weekly goal, and breaking PRs.
          </p>
        </div>

        {state === null ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CurrentTierCard state={state} />
            <XpRulesCard />
            <TierLadder currentLevel={state.level} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Current tier (hero card) ─────────────────────────────────────────────────

function CurrentTierCard({ state }: {
  state: {
    breakdown:   XpBreakdown;
    level:       number;
    tier:        Tier;
    intoLevel:   number;
    nextLevelAt: number;
    progressPct: number;
  };
}) {
  const accent = `oklch(${state.tier.color})`;

  return (
    <div
      className="action-card relative overflow-hidden rounded-2xl px-5 py-5"
      style={{ ['--tier-accent' as string]: `oklch(${state.tier.color} / 0.4)` }}
    >
      <TierCardEffects tier={state.tier} />

      <div className="relative flex items-center gap-4">
        <TierIcon tier={state.tier} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-overline" style={{ color: accent }}>Current Tier</p>
          <h2 className="mt-0.5 font-display text-2xl font-bold">{state.tier.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Level {state.level}</p>
        </div>
      </div>

      {/* Progress to next level */}
      <div className="relative mt-5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">
            {state.intoLevel.toLocaleString()} / {state.nextLevelAt.toLocaleString()} XP
          </span>
          <span className="text-muted-foreground tabular-nums">
            {state.breakdown.total.toLocaleString()} XP total
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.max(2, state.progressPct * 100)}%`,
              background: `linear-gradient(90deg, oklch(${state.tier.color} / 0.6), ${accent})`,
              boxShadow: `0 0 8px oklch(${state.tier.color} / 0.5)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── XP rules explainer ───────────────────────────────────────────────────────

function XpRulesCard() {
  const rules: Array<{ icon: typeof Dumbbell; label: string; xp: number; note?: string }> = [
    { icon: Dumbbell, label: 'Complete a workout', xp: XP_PER_SESSION },
    { icon: Target,   label: 'Hit your weekly goal',   xp: XP_PER_TARGET_HIT, note: 'once per week' },
    { icon: Award,    label: 'Set a personal record',  xp: XP_PER_PR_BONUS,   note: 'per session' },
    { icon: Trophy,   label: 'Light / off-day session', xp: XP_PER_LIGHT_SESSION, note: "you showed up" },
  ];

  return (
    <div className="space-y-2.5">
      <h3 className="section-title">How XP works</h3>
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]">
        {rules.map((r, i) => (
          <div
            key={r.label}
            className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <r.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.label}</p>
              {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
            </div>
            <span className="font-display text-sm font-bold tabular-nums text-primary">
              +{r.xp}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tier ladder (all 9 tiers) ────────────────────────────────────────────────

function TierLadder({ currentLevel }: { currentLevel: number }) {
  // Tier ranges paired with the next tier's minLevel, so each tier knows where
  // it ends. Last tier has no end → open-ended.
  const items = useMemo(() => {
    return TIERS.map((tier, i) => {
      const nextMin = TIERS[i + 1]?.minLevel ?? Infinity;
      const maxLevel = nextMin === Infinity ? null : nextMin - 1;
      const minXp = xpForLevel(tier.minLevel);
      const state: 'passed' | 'current' | 'upcoming' =
        currentLevel >= nextMin ? 'passed'
        : currentLevel >= tier.minLevel ? 'current'
        : 'upcoming';
      return { tier, maxLevel, minXp, state };
    });
  }, [currentLevel]);

  return (
    <div className="space-y-2.5">
      <h3 className="section-title">All tiers</h3>
      <div className="space-y-2.5">
        {items.map(({ tier, maxLevel, minXp, state }) => (
          <TierRow
            key={tier.id}
            tier={tier}
            maxLevel={maxLevel}
            minXp={minXp}
            state={state}
          />
        ))}
      </div>
    </div>
  );
}

function TierRow({
  tier, maxLevel, minXp, state,
}: {
  tier:     Tier;
  maxLevel: number | null;
  minXp:    number;
  state:    'passed' | 'current' | 'upcoming';
}) {
  const accent = `oklch(${tier.color})`;
  const dimmed = state === 'upcoming';
  const description = TIER_DESCRIPTIONS[tier.id] ?? '';
  const levelRange = maxLevel === null
    ? `L${tier.minLevel}+`
    : `L${tier.minLevel}–${maxLevel}`;

  return (
    <div
      className="action-card relative overflow-hidden rounded-2xl px-4 py-3.5"
      style={{
        // Upcoming tiers are dimmed slightly so the eye still lands on the
        // current one first, but their animation still plays so the
        // escalation up the ladder is visible at a glance.
        opacity: dimmed ? 0.7 : 1,
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.4)`,
      }}
    >
      <TierCardEffects tier={tier} />

      <div className="relative flex items-center gap-3">
        <TierIcon tier={tier} size={48} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-base font-bold uppercase tracking-[0.10em]"
              style={{ color: accent }}
            >
              {tier.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{levelRange}</span>
            {state === 'current' && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
                You are here
              </span>
            )}
            {state === 'passed' && (
              <Check className="ml-auto h-3.5 w-3.5 text-emerald-400/80" aria-label="passed" />
            )}
            {state === 'upcoming' && (
              <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground/40" aria-label="locked" />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {state === 'upcoming' && (
            <p className="mt-1 text-[11px] text-muted-foreground/60 tabular-nums">
              Unlocks at {minXp.toLocaleString()} XP
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
