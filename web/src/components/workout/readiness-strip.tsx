'use client';

import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { cn } from '@/lib/utils';
import type { Readiness } from '@/types/training-context';

/**
 * The one-time readiness strip that sits under the workout header.
 *
 * Deliberately not a modal, sheet or gate: it is a single compact row of
 * choices the lifter may answer, correct, or walk straight past. Skip stores
 * nothing — `null` is "never asked", never a fabricated "normal" — and
 * collapses the strip for the rest of this workout. Nothing here can block
 * focusing an input, completing a set, or finishing the session.
 */

const OPTIONS: Array<{ value: Readiness; label: string; description: string }> = [
  { value: 'high',     label: 'High',     description: 'Readiness high' },
  { value: 'normal',   label: 'Normal',   description: 'Readiness normal' },
  { value: 'low',      label: 'Low',      description: 'Readiness low' },
  { value: 'very_low', label: 'Very Low', description: 'Readiness very low' },
];

export function ReadinessStrip() {
  const readiness = useActiveWorkoutStore((state) => state.workout?.readiness ?? null);
  const dismissed = useActiveWorkoutStore((state) => state.workout?.readinessPromptDismissed ?? false);
  const setReadiness = useActiveWorkoutStore((state) => state.setReadiness);
  const dismissPrompt = useActiveWorkoutStore((state) => state.dismissReadinessPrompt);

  if (dismissed) return null;

  return (
    <section
      aria-label="Session readiness"
      className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">How ready do you feel?</p>
        <button
          type="button"
          onClick={() => {
            // Skip is a real answer to the prompt and no answer to the
            // question: it clears any selection and closes the strip.
            if (readiness === null) {
              dismissPrompt();
            } else {
              setReadiness(null);
              dismissPrompt();
            }
          }}
          className="flex h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Skip
        </button>
      </div>

      {/* Wraps into two balanced rows before any tap target shrinks. */}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {OPTIONS.map((option) => {
          const selected = readiness === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              aria-label={option.description}
              onClick={() => setReadiness(selected ? null : option.value)}
              className={cn(
                'flex h-11 min-w-[68px] flex-1 items-center justify-center rounded-xl border px-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                selected
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {readiness !== null && (
        <button
          type="button"
          onClick={dismissPrompt}
          className="mt-1.5 flex h-9 w-full items-center justify-center rounded-xl text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Done
        </button>
      )}
    </section>
  );
}
