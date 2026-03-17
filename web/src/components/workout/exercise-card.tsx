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
    <div className={`premium-card page-reveal px-5 py-5 ${allComplete ? 'border-primary/20' : ''}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="truncate font-display text-3xl font-semibold">{exercise.name}</h2>
            <span className={`status-pill ${allComplete ? 'border-primary/20 bg-primary/10 text-primary' : ''}`}>
              {completedCount}/{sets.length} sets saved
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {exercise.muscle_groups.slice(0, 3).map((muscle) => (
              <MuscleGroupBadge key={muscle} muscle={muscle} />
            ))}
          </div>

          <div className="glass-panel mt-4 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Log This Exercise</p>
            <p className="mt-2 text-sm text-foreground">{fieldSummary}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Fill in the values for each set, then press <span className="font-medium text-foreground">Save Set</span> when that row is done.
            </p>
          </div>
        </div>

        {allComplete && (
          <div className="flex h-12 items-center justify-center rounded-2xl bg-primary/12 px-4 text-sm font-semibold text-primary">
            Exercise Saved
          </div>
        )}
      </div>

      {aiSuggestion && !isSuggestionDismissed && (
        <div className="mt-5">
          <AISuggestionBanner
            suggestion={aiSuggestion}
            onAccept={() => acceptSuggestion(exerciseIndex)}
            onDismiss={() => dismissSuggestion(exerciseIndex)}
          />
        </div>
      )}

      <div className="mt-5 space-y-3">
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

      <div className="mt-5 flex flex-col gap-3 lg:flex-row">
        <button
          type="button"
          onClick={() => addSet(exerciseIndex)}
          className="premium-button-secondary flex-1 justify-center"
        >
          <Plus className="h-4 w-4" />
          Add Set
        </button>

        <button
          type="button"
          onClick={() => setNotesOpen((value) => !value)}
          className="premium-button-secondary justify-center px-4"
        >
          {notesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {notesOpen ? 'Hide Notes' : 'Notes'}
        </button>
      </div>

      {notesOpen && (
        <div className="glass-panel mt-4 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Exercise Notes</p>
          <textarea
            value={cardNotes}
            onChange={(event) => setCardNotes(event.target.value)}
            placeholder="Form cues, reminders, or setup notes..."
            rows={3}
            className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus-visible:outline-none"
          />
        </div>
      )}
    </div>
  );
}
