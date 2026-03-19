'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Award, BarChart3, Link2, Loader2, Trash2, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useSessionDetail } from '@/hooks/use-session-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { formatLongDate } from '@/lib/format-date';
import { formatSetValues } from '@/lib/workout/formatting';
import type { SessionDetailExercise, SessionDetailSet } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';

const SET_TYPE_LABELS: Record<string, string> = {
  working: 'Working',
  warmup: 'Warm Up',
  top: 'Top',
  drop: 'Drop',
  failure: 'Failure',
};

const PR_LABEL: Record<string, string> = {
  best_weight: 'Weight PR',
  best_reps_at_weight: 'Reps PR',
  best_e1rm: 'Est. 1RM PR',
  best_volume: 'Volume PR',
};

function formatPrValue(recordType: string, recordValue: number): string {
  if (recordType === 'best_weight') return `${recordValue}kg`;
  if (recordType === 'best_reps_at_weight') return `${recordValue} reps`;
  if (recordType === 'best_e1rm') return `${recordValue}kg e1RM`;
  if (recordType === 'best_volume') return `${recordValue}kg total`;
  return String(recordValue);
}

function SetLine({
  set,
  trackingSchema,
}: {
  set: SessionDetailSet;
  trackingSchema: TrackingSchema;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2 ${!set.is_completed ? 'opacity-50' : ''}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.75_0.18_55/0.12)] text-xs font-semibold text-[oklch(0.80_0.16_55)]">
        {set.set_index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">
          {SET_TYPE_LABELS[set.set_type] ?? set.set_type}
        </p>
        <p className="text-sm font-medium text-foreground">
          {formatSetValues(set.values, trackingSchema)}
        </p>
      </div>
      {!set.is_completed && (
        <span className="rounded-full border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.12)] px-2 py-0.5 text-xs font-medium text-[oklch(0.82_0.15_60)]">Open</span>
      )}
    </div>
  );
}

function ExerciseBlock({ exercise }: { exercise: SessionDetailExercise }) {
  const hasPrs = exercise.prs.length > 0;

  return (
    <div className="content-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/exercises/${exercise.exercise_id}`} className="group flex items-center gap-1.5">
            <h3 className="truncate text-card-title group-hover:text-primary transition-colors">{exercise.exercise_name}</h3>
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </Link>
          <div className="mt-1 flex flex-wrap gap-1">
            {exercise.muscle_groups.slice(0, 3).map((muscle) => (
              <MuscleGroupBadge key={muscle} muscle={muscle} />
            ))}
          </div>
        </div>
        {hasPrs && (
          <Trophy className="h-4 w-4 shrink-0 text-yellow-400" />
        )}
      </div>

      {hasPrs && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {exercise.prs.map((pr, index) => (
            <span
              key={`${pr.record_type}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-[oklch(0.80_0.16_85/0.25)] bg-[oklch(0.80_0.16_85/0.12)] px-2 py-0.5 text-xs font-semibold text-[oklch(0.85_0.15_85)]"
            >
              <Award className="h-3 w-3" />
              {PR_LABEL[pr.record_type]} · {formatPrValue(pr.record_type, pr.record_value)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {exercise.sets.map((set) => (
          <SetLine key={set.id} set={set} trackingSchema={exercise.tracking_schema} />
        ))}
      </div>
    </div>
  );
}

function SupersetBlock({ exercises }: { exercises: SessionDetailExercise[] }) {
  const maxRounds = Math.max(...exercises.map((ex) => ex.sets.length));
  const exerciseColors = [
    { text: 'text-primary' },
    { text: 'text-[oklch(0.78_0.17_155)]' },
    { text: 'text-[oklch(0.78_0.15_252)]' },
    { text: 'text-[oklch(0.85_0.15_85)]' },
  ];

  return (
    <div className="content-card">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 shrink-0 text-primary" />
        <h3 className="font-display text-base font-bold">Superset</h3>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {exercises.map((ex, i) => (
          <span key={ex.session_exercise_id} className={`text-xs font-semibold ${exerciseColors[i % exerciseColors.length].text}`}>
            {ex.exercise_name}{i < exercises.length - 1 ? ' +' : ''}
          </span>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {Array.from({ length: maxRounds }, (_, roundIndex) => (
          <div key={roundIndex} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Round {roundIndex + 1}</span>
            {exercises.map((ex, exIdx) => {
              const set = ex.sets[roundIndex];
              if (!set) return null;
              const color = exerciseColors[exIdx % exerciseColors.length];
              return (
                <div key={ex.session_exercise_id}>
                  <span className={`text-xs font-semibold ${color.text}`}>{ex.exercise_name}</span>
                  <SetLine set={set} trackingSchema={ex.tracking_schema} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { detail, loading, error } = useSessionDetail(id);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      toast.error('Failed to delete workout');
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }

    toast.success('Workout deleted');
    router.replace('/history');
  }

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        {/* Compact header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold">
              {loading ? 'Loading...' : (detail?.template_name ?? 'Workout')}
            </h1>
            {detail && (
              <p className="text-sm text-muted-foreground">{formatLongDate(detail.started_at)}</p>
            )}
          </div>
          {detail && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground transition-colors duration-150 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
              aria-label="Delete workout"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        )}

        {detail && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="stat-card">
                <p className="text-stat">{detail.exercises.length}</p>
                <p className="text-caption">Exercises</p>
              </div>
              <div className="stat-card">
                <p className="text-stat">{detail.total_sets}</p>
                <p className="text-caption">Sets</p>
              </div>
              <div className="stat-card">
                <p className="text-stat">{formatLongDate(detail.started_at).split(',')[0]}</p>
                <p className="text-caption">Date</p>
              </div>
            </div>

            {/* Exercise blocks — grouped by superset */}
            <div className="space-y-3">
              {(() => {
                const groups: { key: string; isSuperset: boolean; exercises: SessionDetailExercise[] }[] = [];
                let current: typeof groups[0] | null = null;

                for (const exercise of detail.exercises) {
                  const gid = exercise.superset_group_id;
                  if (gid && current?.isSuperset && current.key === gid) {
                    current.exercises.push(exercise);
                  } else {
                    if (current) groups.push(current);
                    current = {
                      key: gid ?? exercise.session_exercise_id,
                      isSuperset: gid != null,
                      exercises: [exercise],
                    };
                  }
                }
                if (current) groups.push(current);

                return groups.map((group) => {
                  const isSuperset = group.isSuperset && group.exercises.length > 1;
                  if (!isSuperset) {
                    return <ExerciseBlock key={group.key} exercise={group.exercises[0]} />;
                  }
                  return <SupersetBlock key={group.key} exercises={group.exercises} />;
                });
              })()}
            </div>
          </>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-[oklch(0.16_0.015_260)] p-5 space-y-4">
              <h3 className="font-display text-lg font-bold">Delete workout?</h3>
              <p className="text-sm text-muted-foreground">
                This will permanently delete this workout session and all its sets. This cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/90 text-sm font-semibold text-white transition-all duration-150 hover:bg-red-500 active:scale-[0.98] disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Workout
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="premium-button-secondary w-full justify-center disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
