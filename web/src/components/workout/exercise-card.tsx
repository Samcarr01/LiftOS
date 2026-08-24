'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Minus, Plus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { eligibleRirSetId, useActiveWorkoutStore } from '@/store/active-workout-store';
import { logSetEntry } from '@/lib/offline';
import { haptic } from '@/lib/haptics';
import { formatSetValues } from '@/lib/workout/formatting';
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
  const setSetRir = useActiveWorkoutStore((store) => store.setSetRir);
  const startRestTimer = useActiveWorkoutStore((store) => store.startRestTimer);
  const dismissSuggestion = useActiveWorkoutStore((store) => store.dismissSuggestion);
  const completedCount = sets.filter((set) => set.isCompleted).length;
  const allComplete = sets.length > 0 && completedCount === sets.length;

  const handleComplete = useCallback((setId: string) => {
    // First statement: the buzz must land before the synchronous store write,
    // not after it.
    haptic('success');
    completeSet(exerciseIndex, setId);

    const updatedExercise = useActiveWorkoutStore
      .getState()
      .workout?.exercises[exerciseIndex];
    const completedSet = updatedExercise?.sets.find((set) => set.id === setId);

    if (completedSet) {
      void logSetEntry(completedSet);
      // Auto-start the rest timer when a set flips to completed (not when
      // uncompleted). rest_seconds = 0/null is the natural opt-out for
      // circuits and cardio.
      const restSeconds = updatedExercise?.sessionExercise.rest_seconds ?? 0;
      if (completedSet.isCompleted && restSeconds > 0) {
        startRestTimer(restSeconds);
      }
    }
  }, [completeSet, exerciseIndex, startRestTimer]);

  const handleUpdate = useCallback((setId: string, patch: { values?: SetValues; setType?: SetEntry['setType'] }) => {
    updateSet(exerciseIndex, setId, {
      ...(patch.values ? { values: patch.values } : {}),
      ...(patch.setType ? { setType: patch.setType } : {}),
    });
  }, [updateSet, exerciseIndex]);

  const handleAddSet = useCallback(() => addSet(exerciseIndex), [addSet, exerciseIndex]);
  const handleDeleteSet = useCallback((setId: string) => deleteSet(exerciseIndex, setId), [deleteSet, exerciseIndex]);
  const handleRirChange = useCallback((setId: string, rir: number | null) => setSetRir(exerciseIndex, setId, rir), [setSetRir, exerciseIndex]);

  // The one set that may be asked "how many left in the tank?" — the last
  // working/top set, and only once it is completed. The store answers the same
  // question with the same function when the value is written, so the control
  // can never appear on a row the store would refuse.
  const rirSetId = useMemo(() => eligibleRirSetId(sets), [sets]);

  const handleRemoveSet = useCallback(() => {
    // Remove the last uncompleted set; if all are completed, remove the very last one
    const lastUncompleted = [...sets].reverse().find((s) => !s.isCompleted);
    const target = lastUncompleted ?? sets[sets.length - 1];
    if (target) deleteSet(exerciseIndex, target.id);
  }, [sets, deleteSet, exerciseIndex]);
  const handleDismiss = useCallback(() => dismissSuggestion(exerciseIndex), [dismissSuggestion, exerciseIndex]);

  // AI target is shown in the suggestion card — don't duplicate in inputs

  return (
    <div className={`premium-card page-reveal px-5 py-5 ${allComplete ? 'state-success' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg font-bold" title={exercise.name}>{exercise.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${allComplete ? 'state-success' : 'state-active'}`}>
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
          <span className="shrink-0 text-sm font-semibold text-[color:var(--state-success-fg)]">Done</span>
        )}
      </div>

      {/* AI Suggestion — passive coaching card. No accept/decline; the target is
          also surfaced inline on each SetRow, so this card is purely informational. */}
      {aiSuggestion && !isSuggestionDismissed && (aiSuggestion.next_target || aiSuggestion.per_set_targets?.length) && (() => {
        const isProgress = aiSuggestion.decision === 'progress';
        const isDeload = aiSuggestion.decision === 'deload';
        const label = isProgress ? 'Level Up' : isDeload ? 'Recovery' : 'Keep Building';
        const perSetTargets = aiSuggestion.per_set_targets?.map(
          (target) => target as SetValues,
        ) ?? [];
        // A per-set vector is the authoritative progression target. Do not let
        // its representative next_target obscure differing set targets.
        const targetSummary = perSetTargets.length > 0
          ? `Set targets: ${perSetTargets.map((target) => formatSetValues(target, exercise.tracking_schema)).join(' · ')}`
          : aiSuggestion.next_target?.display;

        // Single source of truth for the accent — derived strings keep all four
        // surfaces (bg / border / text / divider / bubble) in lock-step.
        const accent = isDeload
          ? '0.70 0.15 250'   // cool blue — back off
          : isProgress
            ? '0.78 0.17 155' // green — go
            : '0.80 0.16 55'; // amber — keep grinding
        const Icon = isDeload ? TrendingDown : isProgress ? TrendingUp : ArrowRight;

        return (
          <div
            className="relative mt-2.5 overflow-hidden rounded-2xl border backdrop-blur-2xl"
            style={{
              background: `linear-gradient(160deg, oklch(${accent} / 0.10) 0%, oklch(${accent} / 0.04) 70%, rgba(255,255,255,0.03) 100%)`,
              borderColor: `oklch(${accent} / 0.22)`,
              boxShadow: `inset 0 1px 0 oklch(${accent} / 0.15), 0 4px 20px -8px oklch(${accent} / 0.25)`,
            }}
          >
            {/* Accent strip — picks up the decision colour at the very top edge.
                top-px (not top-0) so the rounded-2xl corners don't clip the hairline. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-px h-px"
              style={{ background: `linear-gradient(90deg, transparent, oklch(${accent} / 0.7), transparent)` }}
            />

            <div className="relative px-4 pt-3.5 pb-3.5">
              {/* Header: icon bubble + label, dismiss in corner */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `oklch(${accent} / 0.18)`,
                      boxShadow: `inset 0 1px 0 oklch(${accent} / 0.25)`,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: `oklch(${accent})` }} />
                  </div>
                  <span
                    className="text-xs font-bold uppercase"
                    style={{ color: `oklch(${accent})`, letterSpacing: '0.12em' }}
                  >
                    {label}
                  </span>
                </div>
                <button
                  onClick={handleDismiss}
                  className="tappable -mr-2 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                  aria-label="Hide suggestion"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Target — hero line. Display font + tabular nums for that scoreboard feel. */}
              <div className="mt-3.5">
                <p
                  className="font-display text-3xl font-bold leading-tight tabular-nums tracking-tight"
                  style={{ textShadow: `0 0 24px oklch(${accent} / 0.25)` }}
                >
                  {targetSummary}
                </p>
                {aiSuggestion.last_result && (
                  <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                    was <span className="font-medium text-foreground/70">{aiSuggestion.last_result.display}</span>
                  </p>
                )}
              </div>

              {/* Reason — full text, no clamp. Divider in the accent colour. */}
              <p
                className="mt-3.5 border-t pt-3 text-sm leading-relaxed text-muted-foreground"
                style={{ borderColor: `oklch(${accent} / 0.15)` }}
              >
                {aiSuggestion.reason}
              </p>
            </div>
          </div>
        );
      })()}

      <div className="mt-3 space-y-2">
        {sets.map((set, index) => {
          // Per-set targets (Cycle 1): only apply to working/top sets
          // The per_set_targets array contains entries for qualifying sets only,
          // indexed sequentially (not by all-set index)
          const isQualifying = set.setType === 'working' || set.setType === 'top';
          const qualifyingIndex = sets
            .slice(0, index)
            .filter(s => s.setType === 'working' || s.setType === 'top')
            .length;

          const perSetTarget = isQualifying && aiSuggestion?.per_set_targets?.[qualifyingIndex]
            ? (aiSuggestion.per_set_targets[qualifyingIndex] as Record<string, number | string | undefined>)
            : undefined;

          // Row targets ONLY from per_set_targets (never from universal next_target)
          // Universal target remains in summary card only
          const aiTarget = !isSuggestionDismissed && perSetTarget || null;

          return (
            <SetRow
              key={set.id}
              set={set}
              setNumber={index + 1}
              lastValues={lastPerformanceSets?.[index] ?? null}
              fields={fields}
              aiTarget={aiTarget}
              onUpdate={handleUpdate}
              onComplete={handleComplete}
              onDelete={handleDeleteSet}
              showRir={set.id === rirSetId}
              onRirChange={handleRirChange}
            />
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        {sets.length > 1 && (
          <button
            type="button"
            onClick={handleRemoveSet}
            className="tappable flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:border-destructive/30 hover:text-destructive"
            aria-label="Remove set"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleAddSet}
          className="tappable flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-white/10 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          Add Set
        </button>

        <button
          type="button"
          onClick={() => setNotesOpen((value) => !value)}
          className="tappable flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-white/10 px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
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
