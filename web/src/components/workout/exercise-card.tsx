'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { logSetEntry } from '@/lib/offline';
import type { ActiveExerciseState, SetValues } from '@/types/app';
import { AISuggestionBanner } from './ai-suggestion-banner';
import { SetRow } from './set-row';

interface ExerciseCardProps {
  state: ActiveExerciseState;
  exerciseIndex: number;
  isSuggestionDismissed: boolean;
}

export function ExerciseCard({
  state,
  exerciseIndex,
  isSuggestionDismissed,
}: ExerciseCardProps) {
  const { exercise, sets, lastPerformanceSets, aiSuggestion } = state;
  const fields = exercise.tracking_schema.fields;
  const fieldSummary = fields
    .map((field) => {
      if (field.unit === 'seconds') return `${field.label} (sec)`;
      if (field.unit === 'metres') return `${field.label} (m)`;
      if (field.unit) return `${field.label} (${field.unit})`;
      return field.label;
    })
    .join(', ');

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

  function handleComplete(setId: string) {
    completeSet(exerciseIndex, setId);
    navigator.vibrate?.(50);

    const completedSet = useActiveWorkoutStore
      .getState()
      .workout?.exercises[exerciseIndex]?.sets
      .find((set) => set.id === setId);

    if (completedSet) void logSetEntry(completedSet);
  }

  return (
    <div className={`premium-card page-reveal px-4 py-4 ${allComplete ? 'border-emerald-500/25 shadow-[0_0_16px_-6px_oklch(0.72_0.17_170/0.25)]' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg font-bold">{exercise.name}</h2>
            <span className={`text-xs font-semibold ${allComplete ? 'text-primary' : 'text-muted-foreground'}`}>
              {completedCount}/{sets.length}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex gap-1">
              {exercise.muscle_groups.slice(0, 2).map((muscle) => (
                <MuscleGroupBadge key={muscle} muscle={muscle} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{fieldSummary}</span>
          </div>
        </div>
        {allComplete && (
          <span className="shrink-0 text-xs font-semibold text-emerald-400">Done</span>
        )}
      </div>

      {aiSuggestion && !isSuggestionDismissed && (
        <div className="mt-3">
          <AISuggestionBanner
            suggestion={aiSuggestion}
            onAccept={() => acceptSuggestion(exerciseIndex)}
            onDismiss={() => dismissSuggestion(exerciseIndex)}
          />
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
            onUpdate={(patch) => {
              updateSet(exerciseIndex, set.id, {
                ...(patch.values ? { values: patch.values as SetValues } : {}),
                ...(patch.setType ? { setType: patch.setType } : {}),
              });
            }}
            onComplete={() => handleComplete(set.id)}
            onDelete={() => deleteSet(exerciseIndex, set.id)}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => addSet(exerciseIndex)}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Set
        </button>

        <button
          type="button"
          onClick={() => setNotesOpen((value) => !value)}
          className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
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
            className="w-full resize-none rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus-visible:outline-none"
          />
        </div>
      )}
    </div>
  );
}
