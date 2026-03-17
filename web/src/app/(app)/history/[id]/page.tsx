'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trophy, Award } from 'lucide-react';
import { useSessionDetail } from '@/hooks/use-session-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { formatLongDate } from '@/lib/format-date';
import type { SessionDetailExercise, SessionDetailSet } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';
import { formatSetValues } from '@/lib/workout/formatting';

const SET_TYPE_LABELS: Record<string, string> = {
  working: 'W', warmup: 'WU', top: 'T', drop: 'D', failure: 'F',
};

const PR_LABEL: Record<string, string> = {
  best_weight:         'Weight PR',
  best_reps_at_weight: 'Reps PR',
  best_e1rm:           '1RM PR',
  best_volume:         'Volume PR',
};

function formatPrValue(recordType: string, recordValue: number): string {
  if (recordType === 'best_weight') return `${recordValue}kg`;
  if (recordType === 'best_reps_at_weight') return `${recordValue} reps`;
  if (recordType === 'best_e1rm') return `${recordValue}kg e1RM`;
  if (recordType === 'best_volume') return `${recordValue}kg total`;
  return String(recordValue);
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { detail, loading, error } = useSessionDetail(id);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-base font-bold">
          {loading ? 'Loading…' : (detail?.template_name ?? 'Workout')}
        </h1>
      </header>

      {error && (
        <p className="px-4 pt-6 text-sm text-destructive">{error}</p>
      )}

      {loading && (
        <div className="space-y-4 px-4 pt-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {detail && (
        <div className="px-4 pt-4 space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Date"
              value={formatLongDate(detail.started_at)}
              small
            />
            <StatCard
              label="Exercises"
              value={String(detail.exercises.length)}
            />
            <StatCard
              label="Saved Sets"
              value={String(detail.total_sets)}
            />
          </div>

          {/* Exercises */}
          {detail.exercises.map((ex) => (
            <ExerciseBlock key={ex.session_exercise_id} exercise={ex} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-muted px-3 py-3">
      <span className={`font-bold ${small ? 'text-sm' : 'text-lg'}`}>{value}</span>
      <span className="mt-0.5 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function ExerciseBlock({ exercise }: { exercise: SessionDetailExercise }) {
  const hasPrs = exercise.prs.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-card">
      {/* Exercise header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold">{exercise.exercise_name}</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {exercise.muscle_groups.slice(0, 3).map((m) => (
                <MuscleGroupBadge key={m} muscle={m} />
              ))}
            </div>
          </div>
          {hasPrs && (
            <Trophy className="h-4 w-4 shrink-0 text-yellow-500" />
          )}
        </div>

        {/* PRs */}
        {hasPrs && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {exercise.prs.map((pr, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400"
              >
                <Award className="h-2.5 w-2.5" />
                {PR_LABEL[pr.record_type]} · {formatPrValue(pr.record_type, pr.record_value)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sets table */}
      <div className="border-t border-border/50 px-4 pb-3 pt-2">
        <div className="mb-1 flex gap-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          <span className="w-5 text-center">#</span>
          <span className="w-12">Type</span>
          <span className="flex-1">Values</span>
        </div>
        {exercise.sets.map((s) => (
          <SetLine key={s.id} set={s} trackingSchema={exercise.tracking_schema} />
        ))}
      </div>
    </div>
  );
}

function SetLine({ set, trackingSchema }: { set: SessionDetailSet; trackingSchema: TrackingSchema }) {
  return (
    <div
      className={`flex items-center gap-3 py-1 text-sm ${
        !set.is_completed ? 'opacity-40' : ''
      }`}
    >
      <span className="w-5 shrink-0 text-center text-[11px] text-muted-foreground">
        {set.set_index + 1}
      </span>
      <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground">
        {SET_TYPE_LABELS[set.set_type] ?? set.set_type}
      </span>
      <span className="flex-1 font-medium">{formatSetValues(set.values, trackingSchema)}</span>
    </div>
  );
}
