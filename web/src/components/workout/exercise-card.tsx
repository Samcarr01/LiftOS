'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronUp, Minus, Plus, Sparkles, X } from 'lucide-react';
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
  const handleDismiss = useCallback(() => dismissSuggestion(exerciseIndex), [dismissSuggestion, exerciseIndex]);

  const target = aiSuggestion && !isSuggestionDismissed
    ? aiSuggestion.next_target?.values ?? null
    : null;

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

      {/* Inline AI coach indicator */}
      {aiSuggestion && !isSuggestionDismissed && aiSuggestion.next_target && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-[oklch(0.75_0.18_55/0.08)] px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[oklch(0.80_0.16_55)]">
                {aiSuggestion.decision === 'progress' ? 'Beat this' : 'Hold steady'}
              </span>
              {aiSuggestion.decision === 'progress'
                ? <ArrowUpRight className="h-3 w-3 text-primary" />
                : <Minus className="h-3 w-3 text-muted-foreground" />}
              <span className="text-sm text-muted-foreground">·</span>
              <span className="truncate text-sm font-medium text-foreground">{aiSuggestion.next_target.display}</span>
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{aiSuggestion.reason}</p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Dismiss suggestion"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            setNumber={index + 1}
            lastValues={lastPerformanceSets?.[index] ?? null}
            fields={fields}
            aiTarget={target}
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
