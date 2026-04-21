'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  FolderPlus,
  GripVertical,
  Play,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onComplete: () => void;
  /** When true, shows a close button instead of finish (for help page replay) */
  standalone?: boolean;
}

const STEPS = [
  {
    kicker: 'STEP 1 OF 4',
    title: 'Create a Workout Template',
    body: "Start by creating a workout template — your reusable blueprint for a training session. Name it something like 'Push Day' or 'Full Body A'.",
    hint: 'Head to the Templates tab and tap + New.',
  },
  {
    kicker: 'STEP 2 OF 4',
    title: 'Add Your Exercises',
    body: 'Search the exercise library or create your own. Drag to reorder, link exercises into supersets, and set your target number of sets.',
    hint: 'You can always edit templates later.',
  },
  {
    kicker: 'STEP 3 OF 4',
    title: 'Start & Log Sets',
    body: "Hit Start Workout and your sets are already prefilled from last session. Tap the checkmark to confirm each set — adjust weight or reps if needed.",
    hint: 'Most sets take under 2 seconds to log.',
  },
  {
    kicker: 'STEP 4 OF 4',
    title: 'Follow Your Progression',
    body: "After each session, LiftOS analyses your performance and sets a target for next time. Hit your rep targets, then the AI will suggest a weight increase.",
    hint: 'Look for the orange suggestion banner at the top of each exercise.',
  },
] as const;

function StepIllustration({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <FolderPlus className="h-8 w-8 text-primary" />
        </div>
        <div className="flex w-full max-w-[260px] flex-col gap-1.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-primary/40 bg-primary/8 px-3 py-2.5">
            <Plus className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-primary">New Template</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Push Day</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Pull Day</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <Dumbbell className="h-8 w-8 text-primary" />
        </div>
        <div className="flex w-full max-w-[260px] flex-col gap-1.5">
          {['Bench Press', 'Overhead Press', 'Tricep Dips'].map((ex, i) => (
            <div key={ex} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="flex-1 text-sm font-medium">{ex}</span>
              <span className="text-xs text-muted-foreground">{3 + i}×</span>
            </div>
          ))}
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Add Exercise</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[oklch(0.72_0.19_155/0.15)]">
          <Check className="h-8 w-8 text-[oklch(0.78_0.17_155)]" />
        </div>
        <div className="flex w-full max-w-[260px] flex-col gap-1.5">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-xs font-semibold text-primary">Bench Press</p>
          </div>
          {[
            { set: 1, last: '80kg × 8', current: '80kg × 8', done: true },
            { set: 2, last: '80kg × 7', current: '80kg × 7', done: true },
            { set: 3, last: '80kg × 6', current: '', done: false },
          ].map((row) => (
            <div key={row.set} className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5',
              row.done ? 'bg-[oklch(0.72_0.19_155/0.08)]' : 'bg-white/[0.03]',
            )}>
              <span className="w-5 text-xs font-medium text-muted-foreground">{row.set}</span>
              <span className="flex-1 text-xs text-muted-foreground/60">{row.last}</span>
              <span className={cn('flex-1 text-xs font-medium', row.done ? 'text-foreground' : 'text-muted-foreground/40')}>
                {row.done ? row.current : row.last}
              </span>
              <div className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full',
                row.done ? 'bg-[oklch(0.72_0.19_155)] text-white' : 'border border-white/15',
              )}>
                {row.done && <Check className="h-3 w-3" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Step 3 - AI Progression
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <div className="flex w-full max-w-[260px] flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2.5">
          <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">Target: 82.5kg × 5</p>
            <p className="text-xs text-primary/60">You hit 80kg × 8 across all sets — time to go up!</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="text-xs text-muted-foreground">Last session</span>
          <span className="ml-auto text-xs font-medium text-muted-foreground">80kg × 8, 8, 8</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="text-xs text-muted-foreground">Next target</span>
          <span className="ml-auto text-xs font-semibold text-primary">82.5kg × 5</span>
        </div>
      </div>
    </div>
  );
}

export default function GettingStartedTutorial({ onComplete, standalone }: Props) {
  const [step, setStep] = useState(0);

  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Header with close (standalone) or skip */}
      <div className="flex items-center justify-end px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        {standalone ? (
          <button
            onClick={onComplete}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={onComplete}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
        <div className="w-full max-w-md">
          {/* Progress dots */}
          <div className="mb-8 flex justify-center gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-white/15',
                )}
              />
            ))}
          </div>

          {/* Illustration */}
          <div className="mb-8 flex justify-center">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-6">
              <StepIllustration step={step} />
            </div>
          </div>

          {/* Text */}
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">
              {current.kicker}
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold">{current.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {current.body}
            </p>
            <p className="mt-2 text-xs text-muted-foreground/60">{current.hint}</p>
          </div>

          {/* Navigation buttons */}
          <div className="mt-8 flex gap-3">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="premium-button-secondary flex-1 justify-center"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            <button
              onClick={isLast ? onComplete : () => setStep((s) => s + 1)}
              className="premium-button flex-1 justify-center"
            >
              {isLast ? (
                <>
                  {standalone ? 'Done' : 'Get Started'}
                  {!standalone && <Play className="h-4 w-4" />}
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
