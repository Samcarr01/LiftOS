'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Loader2, Check, Dumbbell } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { useExercises } from '@/hooks/use-exercises';
import type { ExerciseWithSchema, ExerciseCreate } from '@/types/app';
import { ExerciseCreateSchema } from '@/lib/validation';
import {
  TRACKING_PRESETS,
  TRACKING_PRESET_LABELS,
  type TrackingPresetKey,
} from '@/types/tracking';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ALL_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Core', 'Calves', 'Cardio', 'Forearms'];
const PRESET_KEYS = Object.keys(TRACKING_PRESETS) as TrackingPresetKey[];

export interface ExerciseSelectionOptions {
  defaultSetCount: number;
}

interface Props {
  onSelect: (exercise: ExerciseWithSchema, options: ExerciseSelectionOptions) => void;
  trigger: React.ReactNode;
  defaultMode?: 'browse' | 'create';
}

function SetCountPicker({
  value,
  onChange,
  description,
}: {
  value: number;
  onChange: (next: number) => void;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Starting sets</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(Math.max(1, value - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.06] text-lg text-muted-foreground transition-colors hover:bg-white/[0.10] hover:text-foreground active:scale-95"
          >
            −
          </button>
          <div className="flex min-w-12 items-center justify-center font-display text-xl font-bold">{value}</div>
          <button
            type="button"
            onClick={() => onChange(Math.min(20, value + 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.06] text-lg text-muted-foreground transition-colors hover:bg-white/[0.10] hover:text-foreground active:scale-95"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExerciseSelector({
  onSelect,
  trigger,
  defaultMode = 'browse',
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'browse' | 'create'>(defaultMode);
  const { exercises, isLoading, createExercise } = useExercises();

  // Browse state
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);

  // Create state
  const [newName, setNewName] = useState('');
  const [newMuscles, setNewMuscles] = useState<string[]>([]);
  const [newPreset, setNewPreset] = useState<TrackingPresetKey>('WEIGHT_REPS');
  const [newNotes, setNewNotes] = useState('');
  const [defaultSetCount, setDefaultSetCount] = useState(3);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setSearch('');
    setMuscleFilter(null);
    setNewName('');
    setNewMuscles([]);
    setNewPreset('WEIGHT_REPS');
    setNewNotes('');
    setDefaultSetCount(3);
  }, [open, defaultMode]);

  const filtered = useMemo(() => {
    let list = exercises;
    if (muscleFilter) {
      const mf = muscleFilter.toLowerCase();
      list = list.filter((e) => e.muscle_groups.some((mg) => mg.toLowerCase() === mf));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [exercises, search, muscleFilter]);

  function handleSelect(
    exercise: ExerciseWithSchema,
    options: ExerciseSelectionOptions = { defaultSetCount },
  ) {
    onSelect(exercise, options);
    setOpen(false);
    setMode(defaultMode);
    setSearch('');
    setMuscleFilter(null);
  }

  function openCreate(prefill = '') {
    if (prefill.trim()) setNewName((current) => current.trim() || prefill.trim());
    setMode('create');
  }

  async function handleCreate() {
    if (!newName.trim()) { toast.error('Name is required'); return; }
    setIsSaving(true);
    try {
      const data: ExerciseCreate = ExerciseCreateSchema.parse({
        name: newName.trim(),
        muscle_groups: newMuscles,
        tracking_schema: TRACKING_PRESETS[newPreset],
        notes: newNotes.trim() || null,
      });
      const exercise = await createExercise(data);
      toast.success(`"${exercise.name}" created`);
      handleSelect(exercise, { defaultSetCount });
      // Reset create form
      setNewName(''); setNewMuscles([]); setNewPreset('WEIGHT_REPS'); setNewNotes('');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to create exercise');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleMuscle(m: string) {
    setNewMuscles((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  return (
    <>
      {/* Wrap trigger in a click handler since @base-ui SheetTrigger doesn't support asChild */}
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex !h-[100dvh] flex-col p-0">
        <SheetHeader className="border-b border-border px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <SheetTitle>{mode === 'create' ? 'Create Exercise' : 'Your Exercises'}</SheetTitle>
            <button
              onClick={() => setMode(mode === 'create' ? 'browse' : 'create')}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
            >
              <Plus className="h-3.5 w-3.5" />
              {mode === 'create' ? 'Browse Exercises' : 'Create Your Own'}
            </button>
          </div>
        </SheetHeader>

        {/* ── Browse mode ───────────────────────────────────── */}
        {mode === 'browse' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mx-4 mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Prefer your own exercise names?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Create an exercise from scratch for weight and reps, weight and laps, time, distance, or laps. You only need the library if you want it.
              </p>
              <button
                onClick={() => openCreate(search)}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Create Custom Exercise
              </button>
            </div>

            <div className="px-4 pt-4">
              <SetCountPicker
                value={defaultSetCount}
                onChange={setDefaultSetCount}
                description={`The next exercise you add to this workout will start with ${defaultSetCount} set${defaultSetCount !== 1 ? 's' : ''}.`}
              />
            </div>

            {/* Search */}
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search your exercises"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            </div>

            {/* Muscle filter chips */}
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 no-scrollbar">
              <button
                onClick={() => setMuscleFilter(null)}
                className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  muscleFilter === null ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')}
              >
                All
              </button>
              {ALL_MUSCLES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMuscleFilter(muscleFilter === m ? null : m)}
                  className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    muscleFilter === m ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Exercise list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Dumbbell className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No exercises found</p>
                  <button
                    onClick={() => openCreate(search)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {search.trim() ? `Create "${search.trim()}"` : 'Create one instead'}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => handleSelect(ex)}
                      className="flex min-h-[56px] w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ex.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {ex.muscle_groups.slice(0, 3).map((m) => (
                            <MuscleGroupBadge key={m} muscle={m} />
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Create mode ───────────────────────────────────── */}
        {mode === 'create' && (
          <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-8 pt-4 gap-6">

            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Exercise name</label>
              <Input
                placeholder="e.g. Barbell Back Squat"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-12 rounded-xl border-white/10 bg-white/[0.06] px-4 text-base"
                autoFocus
              />
            </div>

            {/* Muscle groups */}
            <div className="space-y-2.5">
              <label className="text-sm font-semibold">
                Muscle groups
                {newMuscles.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {newMuscles.length} selected
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_MUSCLES.map((m) => {
                  const selected = newMuscles.includes(m);
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
                {PRESET_KEYS.map((key) => {
                  const selected = newPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewPreset(key)}
                      className={cn(
                        'relative flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-all duration-150',
                        selected
                          ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_-4px_oklch(0.75_0.18_55/0.3)]'
                          : 'border-white/[0.08] bg-white/[0.04] text-foreground hover:border-white/[0.14] hover:bg-white/[0.07]',
                      )}
                    >
                      {selected && (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <span>{TRACKING_PRESET_LABELS[key]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Starting sets */}
            <SetCountPicker
              value={defaultSetCount}
              onChange={setDefaultSetCount}
              description={`Starts with ${defaultSetCount} set${defaultSetCount !== 1 ? 's' : ''} when added to a workout.`}
            />

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Form cues, equipment notes…"
                rows={2}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus-visible:outline-none"
              />
            </div>

            {/* Create button */}
            <button
              type="button"
              onClick={handleCreate}
              disabled={isSaving || !newName.trim()}
              className="premium-button mt-auto justify-center disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Exercise
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}
