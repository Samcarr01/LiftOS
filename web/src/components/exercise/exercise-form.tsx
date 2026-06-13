'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  TRACKING_PRESETS,
  TRACKING_PRESET_LABELS,
  type TrackingPresetKey,
} from '@/types/tracking';
import { cn } from '@/lib/utils';

const ALL_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Core', 'Calves', 'Cardio', 'Forearms'];

// Height + Reps is intentionally excluded — unused and confusing in the UI.
const FORM_PRESET_KEYS = (Object.keys(TRACKING_PRESETS) as TrackingPresetKey[]).filter(
  (key) => key !== 'HEIGHT_REPS',
);

export interface ExerciseFormValues {
  name: string;
  muscleGroups: string[];
  preset: TrackingPresetKey;
  notes: string;
  /** Only present when `showStartingSets` is enabled. */
  startingSets?: number;
}

interface ExerciseFormProps {
  initialName?: string;
  initialMuscleGroups?: string[];
  initialPreset?: TrackingPresetKey;
  initialNotes?: string;
  /** When true, renders the Starting sets stepper (used when adding to a workout). */
  showStartingSets?: boolean;
  initialStartingSets?: number;
  /**
   * When true, the legacy "Height + Reps" tracking type is shown (de-emphasised,
   * last in the list). Used by the Edit form so existing exercises on that type
   * aren't silently converted on save. Hidden in Create.
   */
  allowLegacyTracking?: boolean;
  submitLabel: string;
  onSubmit: (values: ExerciseFormValues) => Promise<void> | void;
  autoFocus?: boolean;
}

/**
 * Shared exercise editor used by both the Create and Edit flows. The only
 * differences between contexts are the initial values, the CTA label, and
 * whether the Starting sets stepper is shown (it only persists when an
 * exercise is added to a workout, so it's hidden in the library Create/Edit).
 */
export function ExerciseForm({
  initialName = '',
  initialMuscleGroups = [],
  initialPreset = 'WEIGHT_REPS',
  initialNotes = '',
  showStartingSets = false,
  initialStartingSets = 3,
  allowLegacyTracking = false,
  submitLabel,
  onSubmit,
  autoFocus = false,
}: ExerciseFormProps) {
  // Legacy "Height + Reps" is only offered in Edit (allowLegacyTracking), appended last.
  const presetKeys: TrackingPresetKey[] = allowLegacyTracking
    ? [...FORM_PRESET_KEYS, 'HEIGHT_REPS']
    : FORM_PRESET_KEYS;

  const [name, setName] = useState(initialName);
  const [muscles, setMuscles] = useState<string[]>(initialMuscleGroups);
  const [preset, setPreset] = useState<TrackingPresetKey>(
    presetKeys.includes(initialPreset) ? initialPreset : 'WEIGHT_REPS',
  );
  const [notes, setNotes] = useState(initialNotes);
  const [startingSets, setStartingSets] = useState(initialStartingSets);
  const [saving, setSaving] = useState(false);

  function toggleMuscle(m: string) {
    setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        muscleGroups: muscles,
        preset,
        notes: notes.trim(),
        ...(showStartingSets ? { startingSets } : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-8 pt-4 gap-6">
      {/* Name */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Exercise name</label>
        <Input
          placeholder="e.g. Barbell Back Squat"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 rounded-xl border-white/10 bg-white/[0.06] px-4 text-base"
          autoFocus={autoFocus}
        />
      </div>

      {/* Muscle groups */}
      <div className="space-y-2.5">
        <label className="text-sm font-semibold">
          Muscle groups
          {muscles.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {muscles.length} selected
            </span>
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_MUSCLES.map((m) => {
            const selected = muscles.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMuscle(m)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-150',
                  selected
                    ? 'bg-primary text-primary-foreground shadow-[0_0_12px_-3px_oklch(0.75_0.18_55/0.4)]'
                    : 'border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground',
                )}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tracking type */}
      <div className="space-y-2.5">
        <label className="text-sm font-semibold">What do you track?</label>
        <div className="grid grid-cols-2 gap-2.5">
          {presetKeys.map((key) => {
            const selected = preset === key;
            const isLegacy = key === 'HEIGHT_REPS';
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-all duration-150',
                  selected
                    ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_-4px_oklch(0.75_0.18_55/0.3)]'
                    : isLegacy
                      ? 'border-white/[0.06] bg-white/[0.02] text-muted-foreground opacity-70 hover:opacity-100'
                      : 'border-white/[0.08] bg-white/[0.04] text-foreground hover:border-white/[0.14] hover:bg-white/[0.07]',
                )}
              >
                {selected && (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <span>{isLegacy ? 'Height + Reps (legacy)' : TRACKING_PRESET_LABELS[key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Starting sets — only when adding to a workout */}
      {showStartingSets && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Starting sets</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Starts with {startingSets} set{startingSets !== 1 ? 's' : ''} when added to a workout.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStartingSets((v) => Math.max(1, v - 1))}
                aria-label="Decrease starting sets"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.06] text-lg text-muted-foreground transition-colors hover:bg-white/[0.10] hover:text-foreground active:scale-95"
              >
                −
              </button>
              <div className="flex min-w-12 items-center justify-center font-display text-xl font-bold">{startingSets}</div>
              <button
                type="button"
                onClick={() => setStartingSets((v) => Math.min(20, v + 1))}
                aria-label="Increase starting sets"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.06] text-lg text-muted-foreground transition-colors hover:bg-white/[0.10] hover:text-foreground active:scale-95"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">
          Notes <span className="font-normal text-muted-foreground">(optional, shown during workout)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Form cues, equipment notes…"
          rows={2}
          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus-visible:outline-none"
        />
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || !name.trim()}
        className="premium-button mt-auto justify-center disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}
