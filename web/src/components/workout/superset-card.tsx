'use client';

import { Link2, Minus, Plus } from 'lucide-react';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { logSetEntry } from '@/lib/offline';
import type { ActiveExerciseState, SetValues } from '@/types/app';
import { SetRow } from './set-row';
import { cn } from '@/lib/utils';

interface SupersetExercise {
  state: ActiveExerciseState;
  exerciseIndex: number;
}

interface SupersetCardProps {
  exercises: SupersetExercise[];
  dismissedSuggestions: number[];
}

// Color assignments for exercises within the superset (static, no need to recreate per render)
const EXERCISE_COLORS = [
  { bg: 'bg-primary/12', text: 'text-primary', border: 'border-primary/20' },
  { bg: 'bg-[oklch(0.72_0.19_155/0.12)]', text: 'text-[oklch(0.78_0.17_155)]', border: 'border-[oklch(0.72_0.19_155/0.20)]' },
  { bg: 'bg-[oklch(0.72_0.17_252/0.12)]', text: 'text-[oklch(0.78_0.15_252)]', border: 'border-[oklch(0.72_0.17_252/0.20)]' },
  { bg: 'bg-[oklch(0.80_0.16_85/0.12)]', text: 'text-[oklch(0.85_0.15_85)]', border: 'border-[oklch(0.80_0.16_85/0.20)]' },
];

export function SupersetCard({ exercises, dismissedSuggestions }: SupersetCardProps) {
  const addSet = useActiveWorkoutStore((store) => store.addSet);
  const updateSet = useActiveWorkoutStore((store) => store.updateSet);
  const deleteSet = useActiveWorkoutStore((store) => store.deleteSet);
  const completeSet = useActiveWorkoutStore((store) => store.completeSet);

  // Figure out the max number of rounds (sets) across all exercises
  const maxRounds = exercises.length > 0
    ? Math.max(...exercises.map((ex) => ex.state.sets.length))
    : 0;

  // Total completion tracking
  const totalSets = exercises.reduce((sum, ex) => sum + ex.state.sets.length, 0);
  const completedSets = exercises.reduce(
    (sum, ex) => sum + ex.state.sets.filter((s) => s.isCompleted).length,
    0,
  );
  const allComplete = totalSets > 0 && completedSets === totalSets;

  function handleComplete(exerciseIndex: number, setId: string) {
    completeSet(exerciseIndex, setId);
    navigator.vibrate?.(50);

    const completedSet = useActiveWorkoutStore
      .getState()
      .workout?.exercises[exerciseIndex]?.sets
      .find((set) => set.id === setId);

    if (completedSet) void logSetEntry(completedSet);
  }

  function handleAddRound() {
    for (const ex of exercises) {
      addSet(ex.exerciseIndex);
    }
  }

  function handleDeleteRound(roundIndex: number) {
    // Delete the set at this round index from each exercise (in reverse to avoid index shift issues)
    for (const ex of [...exercises].reverse()) {
      const set = ex.state.sets[roundIndex];
      if (set) {
        deleteSet(ex.exerciseIndex, set.id);
      }
    }
  }

  return (
    <div
      className={cn(
        'premium-card page-reveal px-5 py-5',
        allComplete && 'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155/0.08)]',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-primary" />
            <h2 className="font-display text-lg font-bold">Superset</h2>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-sm font-semibold',
                allComplete
                  ? 'bg-[oklch(0.72_0.19_155/0.12)] text-[oklch(0.78_0.17_155)]'
                  : 'bg-[oklch(0.75_0.18_55/0.12)] text-[oklch(0.80_0.16_55)]',
              )}
            >
              {completedSets}/{totalSets}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {exercises.map((ex, i) => {
              const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length];
              return (
                <span
                  key={ex.state.sessionExercise.id}
                  className={cn('rounded-md border px-2 py-0.5 text-xs font-semibold', color.bg, color.text, color.border)}
                >
                  {ex.state.exercise.name}
                </span>
              );
            })}
          </div>
        </div>
        {allComplete && (
          <span className="shrink-0 text-sm font-semibold text-[oklch(0.78_0.17_155)]">Done</span>
        )}
      </div>

      {/* Rounds */}
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: maxRounds }, (_, roundIndex) => {
          const roundSets = exercises.map((ex) => ex.state.sets[roundIndex] ?? null);
          const roundComplete = roundSets.every((s) => s?.isCompleted);

          return (
            <div
              key={roundIndex}
              className={cn(
                'rounded-xl border px-2.5 py-2.5',
                roundComplete
                  ? 'border-[oklch(0.72_0.19_155/0.20)] bg-[oklch(0.72_0.19_155/0.06)]'
                  : 'border-white/[0.08] bg-white/[0.03]',
              )}
            >
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Round {roundIndex + 1}
                </span>
                {roundComplete && (
                  <span className="text-[11px] font-semibold text-[oklch(0.78_0.17_155)]">Done</span>
                )}
              </div>

              <div className="space-y-1.5">
                {exercises.map((ex, exIdx) => {
                  const set = ex.state.sets[roundIndex];
                  if (!set) return null;
                  const fields = ex.state.exercise.tracking_schema.fields;
                  const color = EXERCISE_COLORS[exIdx % EXERCISE_COLORS.length];

                  return (
                    <div key={ex.state.sessionExercise.id}>
                      <div className="mb-0.5 flex items-center gap-1.5 px-0.5">
                        <div className={cn('h-1.5 w-1.5 rounded-full', color.bg.replace('/12', ''))} />
                        <span className={cn('text-[11px] font-semibold', color.text)}>
                          {ex.state.exercise.name}
                        </span>
                      </div>
                      <SetRow
                        set={set}
                        setNumber={roundIndex + 1}
                        lastValues={ex.state.lastPerformanceSets?.[roundIndex] ?? null}
                        fields={fields}
                        borderless
                        onUpdate={(patch) => {
                          updateSet(ex.exerciseIndex, set.id, {
                            ...(patch.values ? { values: patch.values as SetValues } : {}),
                            ...(patch.setType ? { setType: patch.setType } : {}),
                          });
                        }}
                        onComplete={() => handleComplete(ex.exerciseIndex, set.id)}
                        onDelete={() => handleDeleteRound(roundIndex)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Remove Round */}
      <div className="mt-3 flex gap-2">
        {maxRounds > 1 && (
          <button
            type="button"
            onClick={() => handleDeleteRound(maxRounds - 1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:border-destructive/30 hover:text-destructive"
            aria-label="Remove last round"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleAddRound}
          aria-label="Add round to superset"
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/10 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Round
        </button>
      </div>
    </div>
  );
}
