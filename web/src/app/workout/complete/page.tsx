'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Award, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useCompletionStore, recoverCompletionResult } from '@/store/completion-store';
import type { CompletionPR, CompletionSummary } from '@/store/completion-store';

const PR_LABEL: Record<CompletionPR['record_type'], string> = {
  best_weight:          'New Weight PR',
  best_reps_at_weight:  'New Reps PR',
  best_e1rm:            'New 1RM PR',
  best_volume:          'New Volume PR',
};

const PR_VALUE_LABEL: Record<CompletionPR['record_type'], string> = {
  best_weight:         'kg',
  best_reps_at_weight: 'reps',
  best_e1rm:           'kg e1RM',
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
    if (prefersReducedMotion()) { setDisplay(value); return; }
    let raf = 0;
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

export default function WorkoutCompletePage() {
  const storeResult = useCompletionStore((s) => s.result);
  const setResult   = useCompletionStore((s) => s.setResult);
  const clearResult = useCompletionStore((s) => s.clearResult);
  const router      = useRouter();
  const firedConfetti = useRef(false);

  useEffect(() => {
    if (!storeResult) {
      const recovered = recoverCompletionResult();
      if (recovered) setResult(recovered);
      else router.replace('/');
    }
  }, [storeResult, setResult, router]);

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
  const volumeDelta = volumeDeltaPct(summary.total_volume_kg, summary.previous?.total_volume_kg);

  function handleDone() {
    clearResult();
    router.replace('/');
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center bg-background px-4 pb-8 pt-8">
      <div className="pointer-events-none absolute inset-0" style={{ background: hasPrs ? 'radial-gradient(circle at 50% 15%, oklch(0.80 0.16 85 / 0.06), transparent 50%)' : 'radial-gradient(circle at 50% 15%, oklch(0.75 0.18 55 / 0.05), transparent 50%)' }} />
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
        <StatCard label="Sets" value={summary.total_sets} />
        <StatCard label="Volume" value={Math.round(summary.total_volume_kg)} suffix="kg" delta={volumeDelta} />
      </div>

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

      {/* Done button */}
      <div className="mt-auto w-full max-w-sm pt-10">
        <button
          onClick={handleDone}
          className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.75_0.18_55/0.35)] transition-all duration-150 hover:brightness-110 hover:shadow-[0_12px_30px_-8px_oklch(0.75_0.18_55/0.45)] active:scale-[0.98] active:brightness-95"
          style={{ background: 'linear-gradient(135deg, oklch(0.75 0.18 55), oklch(0.62 0.17 40))' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix = '',
  delta,
  staticValue,
}: {
  label: string;
  value?: number;
  suffix?: string;
  delta?: number | null;
  staticValue?: string;
}) {
  const hasDelta = delta !== null && delta !== undefined;
  const deltaColor = hasDelta
    ? delta >= 1
      ? 'text-emerald-400'
      : delta <= -1
        ? 'text-orange-400'
        : 'text-muted-foreground'
    : '';
  const deltaArrow = hasDelta ? (delta >= 1 ? '↑' : delta <= -1 ? '↓' : '=') : '';
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.06] backdrop-blur-2xl px-3 py-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <span className="font-display text-2xl font-bold tabular-nums">
        {staticValue !== undefined
          ? staticValue
          : <><AnimatedNumber value={value ?? 0} />{suffix}</>}
      </span>
      {hasDelta && (
        <span className={`mt-0.5 text-xs font-semibold ${deltaColor}`}>
          {deltaArrow} {Math.abs(Math.round(delta))}%
        </span>
      )}
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
