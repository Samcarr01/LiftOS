'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Award, CheckCircle2 } from 'lucide-react';
import { useCompletionStore } from '@/store/completion-store';
import type { CompletionPR } from '@/store/completion-store';

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

export default function WorkoutCompletePage() {
  const result      = useCompletionStore((s) => s.result);
  const clearResult = useCompletionStore((s) => s.clearResult);
  const router      = useRouter();

  // If someone navigates here directly with no result, bounce home
  useEffect(() => {
    if (!result) router.replace('/');
  }, [result, router]);

  if (!result) return null;

  const { summary, newPrs, exerciseNames } = result;
  const hasPrs = newPrs.length > 0;

  function handleDone() {
    clearResult();
    router.replace('/');
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center bg-background px-4 pb-8 pt-8">
      <div className="pointer-events-none absolute inset-0" style={{ background: hasPrs ? 'radial-gradient(circle at 50% 15%, oklch(0.80 0.16 85 / 0.06), transparent 50%)' : 'radial-gradient(circle at 50% 15%, oklch(0.72 0.19 252 / 0.05), transparent 50%)' }} />
      {/* Hero */}
      <div
        className={`
          relative flex h-20 w-20 items-center justify-center rounded-full
          ${hasPrs
            ? 'bg-yellow-500/20 shadow-[0_0_30px_-4px_oklch(0.80_0.16_85/0.35)] animate-bounce-once'
            : 'bg-primary/20 shadow-[0_0_24px_-4px_oklch(0.72_0.19_252/0.3)]'
          }
        `}
      >
        {hasPrs
          ? <Trophy className="h-10 w-10 text-yellow-500" />
          : <CheckCircle2 className="h-10 w-10 text-primary" />
        }
      </div>

      <h1 className="relative mt-5 text-2xl font-bold tracking-tight">
        {hasPrs ? 'Workout Complete' : 'Workout Saved'}
      </h1>
      <p className="relative mt-1 text-sm text-muted-foreground">
        Your progress is saved. AI suggestions will use this session next time.
      </p>

      {/* Stats strip */}
      <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-3">
        <StatCard label="Exercises" value={String(summary.exercise_count)} />
        <StatCard label="Sets" value={String(summary.total_sets)} />
        <StatCard label="Volume" value={`${Math.round(summary.total_volume_kg)}kg`} />
      </div>

      {/* Exercises */}
      {exerciseNames.length > 0 && (
        <div className="mt-6 w-full max-w-sm rounded-2xl border border-border bg-card px-4 py-3">
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
          className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.72_0.19_252/0.35)] transition-all duration-150 hover:brightness-110 hover:shadow-[0_12px_30px_-8px_oklch(0.72_0.19_252/0.45)] active:scale-[0.98] active:brightness-95"
          style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 252), oklch(0.62 0.17 240))' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative flex flex-col items-center overflow-hidden rounded-xl border border-white/[0.10] bg-[oklch(0.19_0.014_264)] px-3 py-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <span className="font-display text-xl font-bold">{value}</span>
      <span className="mt-0.5 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function PrCard({ pr }: { pr: CompletionPR }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[oklch(0.80_0.16_85/0.25)] bg-[oklch(0.80_0.16_85/0.12)] px-4 py-3">
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
