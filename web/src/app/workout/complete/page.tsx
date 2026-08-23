'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trophy, Award, CheckCircle2, Share2, ChevronDown, ChevronUp,
  Dumbbell, Target, Flame, Zap, Layers, BrainCircuit, Star,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { useCompletionStore, recoverCompletionResult } from '@/store/completion-store';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import type { CompletionPR, CompletionSummary } from '@/store/completion-store';
import { useTierPromotion } from '@/hooks/use-tier-promotion';
import { TierPromotionOverlay } from '@/components/home/tier-promotion-overlay';
import { createClient } from '@/lib/supabase/client';
import {
  computeXp, levelFromXp, tierForLevel, computeSessionXp,
  XP_PER_SESSION, XP_PER_LIGHT_SESSION, XP_HEAVY_SET_BONUS,
  XP_FULL_SESSION, XP_VARIETY_PER_EX, XP_VARIETY_CAP,
  XP_TEMPLATE_USER, XP_PER_PR_BONUS,
  type Tier, type XpInputSession, type XpInputPR, type XpBreakdown, type LevelState,
} from '@/lib/leveling/xp';
import { TierIcon, TIER_ICON_MAP } from '@/lib/leveling/tier-visuals';

const PR_LABEL: Record<CompletionPR['record_type'], string> = {
  best_weight:          'New Weight PR',
  best_reps_at_weight:  'New Reps PR',
  best_e1rm:            'New 1RM PR',
  best_volume:          'New Volume PR',
};

const PR_VALUE_LABEL: Record<CompletionPR['record_type'], string> = {
  best_weight:         'kg',
  best_reps_at_weight: 'reps',
  best_e1rm:           'kg est. 1RM',
  best_volume:         'kg volume',
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function volumeDeltaPct(current: number, previous: number | undefined | null): number | null {
  if (!previous || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function buildSubtitle(summary: CompletionSummary, newPrs: CompletionPR[]): string {
  if (newPrs.length === 1) return `New PR on ${newPrs[0].exercise_name}`;
  if (newPrs.length > 1)  return `${newPrs.length} new personal records`;

  const delta = volumeDeltaPct(summary.total_volume_kg, summary.previous?.total_volume_kg);
  if (delta === null) return 'Your progress is saved';
  if (delta >= 2)  return `Volume up ${Math.round(delta)}% vs last time`;
  if (delta <= -2) return `Volume down ${Math.round(Math.abs(delta))}% — recover and rebuild`;
  return 'Matched your last session';
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));

  useEffect(() => {
    let raf = 0;
    if (prefersReducedMotion()) {
      raf = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{Math.round(display).toLocaleString()}</>;
}

// ── XP Slider Component ─────────────────────────────────────────────────────

interface XpSliderData {
  sessionXp: number;
  preLevel: LevelState;
  postLevel: LevelState;
  preTier: Tier;
  postTier: Tier;
  breakdown: {
    sessionBase: number;
    heavySetsXp: number;
    fullSessionXp: number;
    varietyXp: number;
    templateXp: number;
    prXp: number;
  };
}

function XpSlider({ data }: { data: XpSliderData }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { sessionXp, preLevel, postLevel, preTier, postTier, breakdown } = data;
  const accent = `oklch(${postTier.color})`;

  const progressPct = postLevel.progressPct;
  const tierChanged = preTier.id !== postTier.id;

  const Icon = TIER_ICON_MAP[postTier.icon];

  return (
    <div className="mt-6 w-full max-w-sm rounded-2xl border border-white/[0.10] bg-white/[0.06] backdrop-blur-2xl px-4 py-4">
      {/* XP Earned Counter */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-overline">XP earned this session</p>
        <span className="font-display text-lg font-bold tabular-nums" style={{ color: accent }}>
          +<AnimatedNumber value={sessionXp} />
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">
            {preTier.name} L{preLevel.level}
          </span>
          <span className="text-muted-foreground">
            L{postLevel.level + 1}
          </span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
          {/* Pre-session level indicator */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(2, preLevel.progressPct * 100)}%`,
              background: `linear-gradient(90deg, oklch(${preTier.color} / 0.4), oklch(${preTier.color} / 0.6))`,
            }}
          />
          {/* Post-session level indicator (overlay) */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${Math.max(2, progressPct * 100)}%`,
              background: `linear-gradient(90deg, oklch(${postTier.color} / 0.6), ${accent})`,
              boxShadow: `0 0 10px oklch(${postTier.color} / 0.5)`,
              animation: 'tier-soft-glow 3s ease-in-out infinite',
            }}
          />
          {/* Tier icon at current position */}
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-all duration-1000 ease-out"
            style={{ left: `calc(${Math.max(3, progressPct * 100)}% - 10px)` }}
          >
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full"
              style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
            >
              <Icon className="h-3 w-3 text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        {/* Level indicator */}
        <div className="mt-1 text-center">
          <span className="text-xs font-semibold" style={{ color: accent }}>
            {postTier.name} · Level {postLevel.level}
          </span>
          {tierChanged && (
            <span className="ml-1.5 text-xs text-emerald-400">↑ Tier up!</span>
          )}
        </div>
      </div>

      {/* Expandable Breakdown */}
      <button
        onClick={() => setShowBreakdown((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="font-semibold">Breakdown</span>
        {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showBreakdown && (
        <div className="mt-2 space-y-1.5">
          <XpBreakdownRow icon={Dumbbell} label="Session base" xp={breakdown.sessionBase} />
          {breakdown.heavySetsXp > 0 && <XpBreakdownRow icon={Flame} label="Heavy sets" xp={breakdown.heavySetsXp} />}
          {breakdown.fullSessionXp > 0 && <XpBreakdownRow icon={Zap} label="Full session" xp={breakdown.fullSessionXp} />}
          {breakdown.varietyXp > 0 && <XpBreakdownRow icon={Layers} label="Variety" xp={breakdown.varietyXp} />}
          {breakdown.templateXp > 0 && <XpBreakdownRow icon={BrainCircuit} label="Template" xp={breakdown.templateXp} />}
          {breakdown.prXp > 0 && <XpBreakdownRow icon={Trophy} label="PR bonus" xp={breakdown.prXp} />}
        </div>
      )}
    </div>
  );
}

function XpBreakdownRow({ icon: Icon, label, xp }: { icon: typeof Dumbbell; label: string; xp: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xs font-semibold tabular-nums text-primary">+{xp}</span>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function WorkoutCompletePage() {
  const storeResult = useCompletionStore((s) => s.result);
  const setResult   = useCompletionStore((s) => s.setResult);
  const clearResult = useCompletionStore((s) => s.clearResult);
  const router      = useRouter();
  const firedConfetti = useRef(false);

  // XP slider state
  const [xpData, setXpData] = useState<XpSliderData | null>(null);

  // Tier promotion: compute pre/post tier from session+PR history
  const promotion = useTierPromotion(storeResult?.sessionId ?? null);
  const [promotionDismissed, setPromotionDismissed] = useState(false);

  useEffect(() => {
    if (!storeResult) {
      const recovered = recoverCompletionResult();
      if (recovered) setResult(recovered);
      else router.replace('/');
      return;
    }
    // Splash is showing real data — safe to clear the active workout now.
    useActiveWorkoutStore.getState().clearWorkout();
  }, [storeResult, setResult, router]);

  // Compute XP for the slider
  useEffect(() => {
    if (!storeResult) return;
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
      const allSessions = (sessionsRes.data ?? []) as XpInputSession[];
      const allPRs      = (prsRes.data ?? []) as XpInputPR[];

      const preSessions = allSessions.filter((s) => s.id !== storeResult.sessionId);
      const prePRs      = allPRs.filter((p) => p.session_id !== storeResult.sessionId);

      const pre  = computeXp(preSessions, prePRs, weeklyTarget);
      const post = computeXp(allSessions,  allPRs,  weeklyTarget);

      const preLevel  = levelFromXp(pre.total);
      const postLevel = levelFromXp(post.total);
      const preTier   = tierForLevel(preLevel.level);
      const postTier  = tierForLevel(postLevel.level);

      const sessionXp = post.total - pre.total;

      // Compute session-level breakdown
      // Determine if the session has a PR
      const hasPr = allPRs.some((p) => p.session_id === storeResult.sessionId);
      const sessionDetail = computeSessionXp(
        { id: storeResult.sessionId, started_at: new Date().toISOString(), is_light_session: false },
        storeResult.summary.total_sets,  // heavy set count (approximate)
        storeResult.summary.exercise_count,
        hasPr,
      );

      setXpData({
        sessionXp,
        preLevel,
        postLevel,
        preTier,
        postTier,
        breakdown: {
          sessionBase:   sessionDetail.sessionBase,
          heavySetsXp:   sessionDetail.heavySetsXp,
          fullSessionXp: storeResult.summary.total_sets > 0 ? XP_FULL_SESSION : 0,
          varietyXp:     Math.min(storeResult.summary.exercise_count * XP_VARIETY_PER_EX, XP_VARIETY_CAP),
          templateXp:    0, // Can't easily determine if template was used from completion store
          prXp:          hasPr ? XP_PER_PR_BONUS : 0,
        },
      });
    })();

    return () => { cancelled = true; };
  }, [storeResult]);

  useEffect(() => {
    if (!storeResult || storeResult.newPrs.length === 0) return;
    if (firedConfetti.current) return;
    if (prefersReducedMotion()) return;
    firedConfetti.current = true;
    const timer = window.setTimeout(() => {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { x: 0.5, y: 0.25 },
        colors: ['#FFD54F', '#FBC02D', '#FFA000', '#FFB300', '#FFC107'],
        ticks: 220,
        gravity: 1,
        scalar: 0.9,
        disableForReducedMotion: true,
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [storeResult]);

  const result = storeResult;
  if (!result) return null;

  const { summary, newPrs, exerciseNames } = result;
  const hasPrs = newPrs.length > 0;

  function handleDone() {
    clearResult();
    router.replace('/');
  }

  function buildShareText(): string {
    const lines = ['💪 Workout complete — LiftOS'];
    lines.push(
      `⏱ ${formatDuration(summary.duration_seconds)} · ${summary.total_sets} set${summary.total_sets === 1 ? '' : 's'} · ${Math.round(summary.total_volume_kg).toLocaleString()} kg`,
    );
    if (newPrs.length > 0) {
      lines.push('', '🏆 New PRs:');
      for (const pr of newPrs) {
        lines.push(`• ${pr.exercise_name} — ${pr.record_value} ${PR_VALUE_LABEL[pr.record_type]}`);
      }
    }
    return lines.join('\n');
  }

  async function handleShare() {
    const text = buildShareText();
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'LiftOS workout', text });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success('Summary copied to clipboard');
      }
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  return (
    <div className="page-shell min-h-[100dvh]">
      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center px-4 pb-8 pt-8">
      {/* Hero */}
      <div
        className={`
          relative flex h-20 w-20 items-center justify-center rounded-full
          ${hasPrs
            ? 'bg-yellow-500/20 shadow-[0_0_30px_-4px_oklch(0.80_0.16_85/0.35)] animate-bounce-once'
            : 'bg-primary/20 shadow-[0_0_24px_-4px_oklch(0.75_0.18_55/0.3)]'
          }
        `}
      >
        {hasPrs
          ? <Trophy className="h-10 w-10 text-yellow-500" />
          : <CheckCircle2 className="h-10 w-10 text-primary" />
        }
      </div>

      <h1 className="relative mt-5 text-3xl font-bold tracking-tight">
        {hasPrs ? 'Workout Complete' : 'Workout Saved'}
      </h1>
      <p className="relative mt-1 max-w-sm text-center text-sm text-muted-foreground">
        {buildSubtitle(summary, newPrs)}
      </p>

      {/* Stats strip */}
      <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-4">
        <StatCard label="Duration" staticValue={formatDuration(summary.duration_seconds)} />
        <StatCard label={summary.total_sets === 1 ? 'Set' : 'Sets'} value={summary.total_sets} />
        <StatCard label="Volume" value={Math.round(summary.total_volume_kg)} suffix="kg" />
      </div>

      {/* XP Slider — between stats strip and exercises */}
      {xpData && <XpSlider data={xpData} />}

      {/* Exercises */}
      {exerciseNames.length > 0 && (
        <div className="mt-6 w-full max-w-sm rounded-2xl border border-white/[0.10] bg-white/[0.06] backdrop-blur-2xl px-4 py-4">
          <p className="text-overline mb-2">
            Exercises ({summary.exercise_count})
          </p>
          <ul className="space-y-1">
            {exerciseNames.map((name) => (
              <li key={name} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PR cards */}
      {hasPrs && (
        <div className="mt-6 w-full max-w-sm space-y-3">
          <p className="text-overline">
            Personal Records 🎉
          </p>
          {newPrs.map((pr, i) => (
            <PrCard key={i} pr={pr} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto w-full max-w-sm space-y-2.5 pt-10">
        <button
          onClick={() => void handleShare()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.06] text-sm font-semibold text-foreground backdrop-blur-xl transition-all duration-150 hover:bg-white/[0.10] active:scale-[0.98]"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button
          onClick={handleDone}
          className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.75_0.18_55/0.35)] transition-all duration-150 hover:brightness-110 hover:shadow-[0_12px_30px_-8px_oklch(0.75_0.18_55/0.45)] active:scale-[0.98] active:brightness-95"
          style={{ background: 'linear-gradient(135deg, oklch(0.75 0.18 55), oklch(0.62 0.17 40))' }}
        >
          Done
        </button>
      </div>

      {/* Tier-up takeover — renders on top of everything when crossed */}
      {promotion && !promotionDismissed && (
        <TierPromotionOverlay
          toTier={promotion.toTier}
          newLevel={promotion.newLevel}
          onDismiss={() => setPromotionDismissed(true)}
        />
      )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix = '',
  staticValue,
}: {
  label: string;
  value?: number;
  suffix?: string;
  staticValue?: string;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.06] backdrop-blur-2xl px-3 py-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <span className="font-display text-2xl font-bold tabular-nums">
        {staticValue !== undefined
          ? staticValue
          : <><AnimatedNumber value={value ?? 0} />{suffix ? ` ${suffix}` : ''}</>}
      </span>
      <span className="mt-0.5 text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function PrCard({ pr }: { pr: CompletionPR }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[oklch(0.80_0.16_85/0.25)] bg-[oklch(0.80_0.16_85/0.12)] px-4 py-3">
      <Award className="h-5 w-5 shrink-0 text-yellow-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{pr.exercise_name}</p>
        <p className="text-xs text-muted-foreground">{PR_LABEL[pr.record_type]}</p>
      </div>
      <span className="shrink-0 text-sm font-bold text-yellow-500">
        {pr.record_value} {PR_VALUE_LABEL[pr.record_type]}
      </span>
    </div>
  );
}