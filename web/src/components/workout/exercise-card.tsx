'use client';

import { useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { SetRow } from './set-row';
import { AISuggestionBanner } from './ai-suggestion-banner';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { logSetEntry } from '@/lib/offline';
import type { ActiveExerciseState, SetValues } from '@/types/app';

interface ExerciseCardProps {
  state:          ActiveExerciseState;
  exerciseIndex:  number;
  isSuggestionDismissed: boolean;
}

export function ExerciseCard({ state, exerciseIndex, isSuggestionDismissed }: ExerciseCardProps) {
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

  const addSet         = useActiveWorkoutStore((s) => s.addSet);
  const updateSet      = useActiveWorkoutStore((s) => s.updateSet);
  const deleteSet      = useActiveWorkoutStore((s) => s.deleteSet);
  const completeSet    = useActiveWorkoutStore((s) => s.completeSet);
  const acceptSug      = useActiveWorkoutStore((s) => s.acceptSuggestion);
  const dismissSug     = useActiveWorkoutStore((s) => s.dismissSuggestion);
  const allComplete = sets.length > 0 && sets.every((s) => s.isCompleted);

  function handleComplete(setId: string) {
    completeSet(exerciseIndex, setId);
    navigator.vibrate?.(50);

    // Write completed set to IndexedDB for offline persistence (fire-and-forget)
    const completedSet = useActiveWorkoutStore
      .getState()
      .workout?.exercises[exerciseIndex]?.sets
      .find((s) => s.id === setId);
    if (completedSet) void logSetEntry(completedSet);
  }

  return (
    <div className={`rounded-2xl border border-border bg-card ${allComplete ? 'opacity-80' : ''}`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{exercise.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {exercise.muscle_groups.slice(0, 3).map((m) => (
                <MuscleGroupBadge key={m} muscle={m} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground/80">
              Log: {fieldSummary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Fill in each box, then tap Save on the right for that set.
            </p>
          </div>
          {/* Collapse indicator */}
          {allComplete && (
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              Done
            </span>
          )}
        </div>

        {/* AI suggestion */}
        {aiSuggestion && !isSuggestionDismissed && (
          <div className="mt-3">
            <AISuggestionBanner
              suggestion={aiSuggestion}
              onAccept={() => acceptSug(exerciseIndex)}
              onDismiss={() => dismissSug(exerciseIndex)}
            />
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 border-t border-border/50 px-2 py-1.5">
        <div className="w-9 shrink-0" />
        <div className="w-[72px] shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Previous
        </div>
        <div className="flex-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Log Now
        </div>
        {/* spacers for checkbox + delete */}
        <div className="w-[44px] shrink-0" />
        <div className="w-9 shrink-0" />
      </div>

      {/* Set rows */}
      <div className="px-2 pb-2">
        {sets.map((set, i) => (
          <SetRow
            key={set.id}
            set={set}
            setNumber={i + 1}
            lastValues={(lastPerformanceSets?.[i]) ?? null}
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

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-border/50 px-4 py-3">
        <button
          type="button"
          onClick={() => addSet(exerciseIndex)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary active:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Add Set
        </button>

        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="flex h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          {notesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {notesOpen ? 'Hide Notes' : 'Notes'}
        </button>
      </div>

      {/* Notes textarea */}
      {notesOpen && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3">
          <textarea
            value={cardNotes}
            onChange={(e) => setCardNotes(e.target.value)}
            placeholder="Notes for this exercise…"
            rows={2}
            className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>
  );
}
