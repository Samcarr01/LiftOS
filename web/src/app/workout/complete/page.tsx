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
    <div className="flex min-h-[100dvh] flex-col items-center bg-background px-4 pb-8 pt-12">
      {/* Hero */}
      <div
        className={`
          flex h-20 w-20 items-center justify-center rounded-full
          ${hasPrs
            ? 'bg-yellow-500/20 animate-bounce-once'
            : 'bg-primary/20'
          }
        `}
      >
        {hasPrs
          ? <Trophy className="h-10 w-10 text-yellow-500" />
          : <CheckCircle2 className="h-10 w-10 text-primary" />
        }
      </div>

      <h1 className="mt-5 text-2xl font-bold tracking-tight">
        {hasPrs ? 'Workout Complete' : 'Workout Saved'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
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
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-muted px-3 py-4">
      <span className="text-lg font-bold">{value}</span>
      <span className="mt-0.5 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function PrCard({ pr }: { pr: CompletionPR }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
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
