'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Plus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { logSetEntry } from '@/lib/offline';
import type { ActiveExerciseState, SetEntry, SetValues } from '@/types/app';
import { SetRow } from './set-row';

interface ExerciseCardProps {
  state: ActiveExerciseState;
  exerciseIndex: number;
  isSuggestionDismissed: boolean;
}

export const ExerciseCard = memo(function ExerciseCard({
  state,
  exerciseIndex,
  isSuggestionDismissed,
}: ExerciseCardProps) {
  const { exercise, sets, lastPerformanceSets, aiSuggestion } = state;
  const fields = exercise.tracking_schema.fields;

  const fieldSummary = useMemo(() =>
    fields
      .map((field) => {
        if (field.unit === 'seconds') return `${field.label} (sec)`;
        if (field.unit === 'metres') return `${field.label} (m)`;
        if (field.unit) return `${field.label} (${field.unit})`;
        return field.label;
      })
      .join(', '),
    [fields],
  );

  const [notesOpen, setNotesOpen] = useState(false);
  const [cardNotes, setCardNotes] = useState('');

  const addSet = useActiveWorkoutStore((store) => store.addSet);
  const updateSet = useActiveWorkoutStore((store) => store.updateSet);
  const deleteSet = useActiveWorkoutStore((store) => store.deleteSet);
  const completeSet = useActiveWorkoutStore((store) => store.completeSet);
  const acceptSuggestion = useActiveWorkoutStore((store) => store.acceptSuggestion);
  const dismissSuggestion = useActiveWorkoutStore((store) => store.dismissSuggestion);
  const completedCount = sets.filter((set) => set.isCompleted).length;
  const allComplete = sets.length > 0 && completedCount === sets.length;

  const handleComplete = useCallback((setId: string) => {
    completeSet(exerciseIndex, setId);
    navigator.vibrate?.(50);

    const completedSet = useActiveWorkoutStore
      .getState()
      .workout?.exercises[exerciseIndex]?.sets
      .find((set) => set.id === setId);

    if (completedSet) void logSetEntry(completedSet);
  }, [completeSet, exerciseIndex]);

  const handleUpdate = useCallback((setId: string, patch: { values?: SetValues; setType?: SetEntry['setType'] }) => {
    updateSet(exerciseIndex, setId, {
      ...(patch.values ? { values: patch.values } : {}),
      ...(patch.setType ? { setType: patch.setType } : {}),
    });
  }, [updateSet, exerciseIndex]);

  const handleAddSet = useCallback(() => addSet(exerciseIndex), [addSet, exerciseIndex]);
  const handleAccept = useCallback(() => acceptSuggestion(exerciseIndex), [acceptSuggestion, exerciseIndex]);
  const handleDismiss = useCallback(() => dismissSuggestion(exerciseIndex), [dismissSuggestion, exerciseIndex]);

  // AI target is shown in the suggestion card — don't duplicate in inputs

  return (
    <div className={`premium-card page-reveal px-5 py-5 ${allComplete ? 'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155/0.08)]' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg font-bold" title={exercise.name}>{exercise.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${allComplete ? 'bg-[oklch(0.72_0.19_155/0.12)] text-[oklch(0.78_0.17_155)]' : 'bg-[oklch(0.75_0.18_55/0.12)] text-[oklch(0.80_0.16_55)]'}`}>
              {completedCount}/{sets.length}
            </span>
          </div>
          {exercise.notes && (
            <p className="mt-0.5 text-sm italic text-muted-foreground">{exercise.notes}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <div className="flex gap-1">
              {exercise.muscle_groups.slice(0, 2).map((muscle) => (
                <MuscleGroupBadge key={muscle} muscle={muscle} />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">{fieldSummary}</span>
          </div>
        </div>
        {allComplete && (
          <span className="shrink-0 text-sm font-semibold text-[oklch(0.78_0.17_155)]">Done</span>
        )}
      </div>

      {/* AI Suggestion Banner */}
      {aiSuggestion && !isSuggestionDismissed && aiSuggestion.next_target && (() => {
        const isProgress = aiSuggestion.decision === 'progress';
        const isDeload = aiSuggestion.decision === 'deload';
        const label = isProgress ? 'Level Up' : isDeload ? 'Recovery' : 'Keep Building';
        const accentBg = isDeload
          ? 'bg-[oklch(0.60_0.15_250/0.10)] border-[oklch(0.60_0.15_250/0.20)]'
          : isProgress
            ? 'bg-[oklch(0.72_0.19_155/0.08)] border-[oklch(0.72_0.19_155/0.20)]'
            : 'bg-[oklch(0.75_0.18_55/0.08)] border-[oklch(0.75_0.18_55/0.18)]';
        const accentText = isDeload
          ? 'text-[oklch(0.70_0.15_250)]'
          : isProgress
            ? 'text-[oklch(0.78_0.17_155)]'
            : 'text-[oklch(0.80_0.16_55)]';
        const Icon = isDeload ? TrendingDown : isProgress ? TrendingUp : ArrowRight;

        return (
          <div className={`mt-2.5 rounded-2xl border px-3.5 py-3 ${accentBg}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${accentText}`} />
                <span className={`text-sm font-semibold ${accentText}`}>{label}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleAccept}
                  className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    isDeload
                      ? 'bg-[oklch(0.60_0.15_250/0.20)] text-[oklch(0.70_0.15_250)] hover:bg-[oklch(0.60_0.15_250/0.30)]'
                      : isProgress
                        ? 'bg-[oklch(0.72_0.19_155/0.18)] text-[oklch(0.78_0.17_155)] hover:bg-[oklch(0.72_0.19_155/0.28)]'
                        : 'bg-primary/15 text-primary hover:bg-primary/25'
                  }`}
                >
                  Apply
                </button>
                <button
                  onClick={handleDismiss}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.06]"
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-base font-bold">{aiSuggestion.next_target.display}</p>
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{aiSuggestion.reason}</p>
          </div>
        );
      })()}

      <div className="mt-3 space-y-2">
        {sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            setNumber={index + 1}
            lastValues={lastPerformanceSets?.[index] ?? null}
            fields={fields}
            aiTarget={
              aiSuggestion?.next_target && !isSuggestionDismissed
                ? (aiSuggestion.next_target.values as Record<string, number | string | undefined>)
                : null
            }
            onUpdate={(patch) => handleUpdate(set.id, patch)}
            onComplete={() => handleComplete(set.id)}
            onDelete={() => deleteSet(exerciseIndex, set.id)}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleAddSet}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/10 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Set
        </button>

        <button
          type="button"
          onClick={() => setNotesOpen((value) => !value)}
          className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-white/10 px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {notesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Notes
        </button>
      </div>

      {notesOpen && (
        <div className="mt-2">
          <textarea
            value={cardNotes}
            onChange={(event) => setCardNotes(event.target.value)}
            placeholder="Form cues, reminders..."
            rows={2}
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus-visible:outline-none"
          />
        </div>
      )}
    </div>
  );
});
