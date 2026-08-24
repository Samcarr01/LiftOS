'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check, Lock,
  Dumbbell, Trophy, Target, Award, Flame, Zap, RotateCcw,
  Repeat, Star, Layers, BrainCircuit,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import {
  computeXp, levelFromXp, tierForLevel, xpForLevel,
  TIERS,
  XP_PER_SESSION, XP_PER_LIGHT_SESSION, XP_PER_TARGET_HIT, XP_PER_PR_BONUS,
  XP_HEAVY_SET_BONUS, XP_VOLUME_PR, XP_FULL_SESSION, XP_DELOAD_WEEK,
  XP_COMEBACK, XP_VARIETY_PER_EX, XP_VARIETY_CAP, XP_WEEKLY_STREAK, XP_STREAK_CAP, XP_TEMPLATE_USER,
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
    <PageShell title="Levels" back="/" className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Twelve tiers from Bronze to Apex. Earn XP from 12 sources — showing up,
        intensity, consistency, variety, and more.
      </p>

        {state === null ? (
          <LevelsLoading />
        ) : (
          <>
            <CurrentTierCard state={state} />
            <XpRulesCard />
            <TierLadder currentLevel={state.level} />
          </>
        )}
    </PageShell>
  );
}

function LevelsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading levels">
      <Skeleton className="h-[166px] w-full rounded-2xl" />
      <Skeleton className="h-[52px] w-full rounded-2xl" />
      <section className="space-y-2.5">
        <Skeleton className="h-5 w-20" />
        {Array.from({ length: TIERS.length }, (_, index) => (
          <Skeleton key={index} className="h-[101px] w-full rounded-2xl" />
        ))}
      </section>
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
          <p className="text-xs font-semibold tracking-wide" style={{ color: accent }}>Current Tier</p>
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
  const [expanded, setExpanded] = useState(false);
  const rules: Array<{ icon: typeof Dumbbell; label: string; xp: string | number; note?: string; category: string }> = [
    // Base
    { icon: Dumbbell,   label: 'Complete a workout',       xp: XP_PER_SESSION,       note: 'per session',           category: 'Base' },
    { icon: Dumbbell,   label: 'Light / off-day session',  xp: XP_PER_LIGHT_SESSION, note: 'per session',           category: 'Base' },
    // Consistency
    { icon: Target,     label: 'Hit your weekly goal',     xp: XP_PER_TARGET_HIT,    note: 'once per week',         category: 'Consistency' },
    { icon: Repeat,     label: 'Weekly streak',            xp: `+${XP_WEEKLY_STREAK}`, note: `per week, cap ${XP_STREAK_CAP}`, category: 'Consistency' },
    // Achievement
    { icon: Award,      label: 'Set a personal record',    xp: XP_PER_PR_BONUS,      note: 'per session',           category: 'Achievement' },
    { icon: Trophy,     label: 'Volume PR',                xp: XP_VOLUME_PR,         note: 'first time weekly',     category: 'Achievement' },
    // Intensity
    { icon: Flame,      label: 'Heavy set bonus',          xp: `+${XP_HEAVY_SET_BONUS}`, note: 'per set ≥85% e1RM', category: 'Intensity' },
    // Discipline
    { icon: Zap,        label: 'Full session',             xp: XP_FULL_SESSION,      note: 'complete all sets',     category: 'Discipline' },
    { icon: RotateCcw,  label: 'Deload week',              xp: XP_DELOAD_WEEK,       note: 'complete deload',       category: 'Discipline' },
    // Retention
    { icon: Star,       label: 'Comeback',                 xp: XP_COMEBACK,          note: 'after 14+ day gap',     category: 'Retention' },
    // Balance
    { icon: Layers,     label: 'Variety bonus',            xp: `+${XP_VARIETY_PER_EX}`, note: `per exercise, cap ${XP_VARIETY_CAP}`, category: 'Balance' },
    // Planning
    { icon: BrainCircuit, label: 'Template user',          xp: XP_TEMPLATE_USER,     note: 'from saved template',   category: 'Planning' },
  ];

  const categories = ['Base', 'Consistency', 'Achievement', 'Intensity', 'Discipline', 'Retention', 'Balance', 'Planning'];

  return (
    <div className="space-y-2.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="action-card px-4 py-3"
      >
        <h3 className="section-title mb-0">How XP works — 12 sources</h3>
        <span className="text-xs font-semibold text-primary">
          {expanded ? 'Hide' : 'Show rules'}
        </span>
      </button>
      {expanded && (
        <div className="content-card overflow-hidden">
          {categories.map((cat) => {
            const catRules = rules.filter((r) => r.category === cat);
            if (catRules.length === 0) return null;
            return (
              <div key={cat}>
                <div className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground/60 uppercase">
                  {cat}
                </div>
                {catRules.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06] first:border-t-0"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <r.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.label}</p>
                      {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    </div>
                    <span className="font-display text-sm font-bold tabular-nums text-primary shrink-0">
                      +{r.xp}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
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
        // current one first. Keep non-current ladder tiers static rather than
        // continuously animating every card on the page.
        opacity: dimmed ? 0.7 : 1,
        ['--tier-accent' as string]: `oklch(${tier.color} / 0.4)`,
      }}
    >
      {state === 'current' && <TierCardEffects tier={tier} />}

      <div className="relative flex items-center gap-3">
        <TierIcon tier={tier} size={48} static={state !== 'current'} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-base font-bold tracking-tight"
              style={{ color: accent }}
            >
              {tier.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{levelRange}</span>
            {state === 'current' && (
              <span className="ml-auto text-xs font-semibold tracking-wide" style={{ color: accent }}>
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
            <p className="mt-1 text-xs text-muted-foreground/60 tabular-nums">
              Unlocks at {minXp.toLocaleString()} XP
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
