'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Loader2, Check, Dumbbell } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { useExercises } from '@/hooks/use-exercises';
import type { ExerciseWithSchema, ExerciseCreate } from '@/types/app';
import { ExerciseCreateSchema } from '@/lib/validation';
import { TRACKING_PRESETS, type TrackingPresetKey } from '@/types/tracking';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ALL_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Core', 'Calves', 'Cardio', 'Forearms'];
const PRESET_KEYS = Object.keys(TRACKING_PRESETS) as TrackingPresetKey[];
const PRESET_LABELS: Record<TrackingPresetKey, string> = {
  WEIGHT_REPS: 'Weight + Reps', BODYWEIGHT_REPS: 'Bodyweight + Reps',
  TIME: 'Time', DISTANCE: 'Distance', LAPS: 'Laps',
};

interface Props {
  onSelect: (exercise: ExerciseWithSchema) => void;
  trigger: React.ReactNode;
  defaultMode?: 'browse' | 'create';
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

  function handleSelect(exercise: ExerciseWithSchema) {
    onSelect(exercise);
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
      handleSelect(exercise);
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

  // Preview set fields for the chosen preset
  const previewFields = TRACKING_PRESETS[newPreset].fields;

  return (
    <>
      {/* Wrap trigger in a click handler since @base-ui SheetTrigger doesn't support asChild */}
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex h-[90dvh] flex-col rounded-t-2xl p-0">
        <SheetHeader className="border-b border-border px-4 pb-3 pt-5">
          <div className="flex items-center gap-3">
            <SheetTitle>{mode === 'create' ? 'Create Exercise' : 'Exercise Library'}</SheetTitle>
            <button
              onClick={() => setMode(mode === 'create' ? 'browse' : 'create')}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
            >
              <Plus className="h-3.5 w-3.5" />
              {mode === 'create' ? 'Use Library' : 'Create Your Own'}
            </button>
          </div>
        </SheetHeader>

        {/* ── Browse mode ───────────────────────────────────── */}
        {mode === 'browse' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mx-4 mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Prefer your own exercise names?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Create an exercise from scratch for weight and reps, time, distance, or laps. You only need the library if you want it.
              </p>
              <button
                onClick={() => openCreate(search)}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Create Custom Exercise
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search the library"
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
                  <p className="text-sm text-muted-foreground">No exercises found in the library</p>
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
          <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-6 pt-2 gap-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Create exactly what you do in the gym. AI uses your logged performance next time to suggest what to lift.
            </p>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Exercise name</label>
              <Input
                placeholder="e.g. Barbell Back Squat"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10"
                autoFocus
              />
            </div>

            {/* Muscle groups */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Muscle groups</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_MUSCLES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMuscle(m)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      newMuscles.includes(m)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Tracking type */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Tracking type</label>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNewPreset(key)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      newPreset === key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{PRESET_LABELS[key]}</span>
                      {newPreset === key && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Set preview */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Set preview</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground w-4">1</span>
                {previewFields.map((f) => (
                  <div key={f.key} className="flex items-center gap-1">
                    <span className="rounded border border-input bg-card px-2 py-0.5 text-xs text-muted-foreground">
                      {f.unit ?? f.type}
                    </span>
                    <span className="text-xs text-muted-foreground">{f.label}</span>
                  </div>
                ))}
                <Check className="ml-auto h-4 w-4 text-muted-foreground/30" />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Form cues, equipment notes…"
                rows={2}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Create button */}
            <button
              type="button"
              onClick={handleCreate}
              disabled={isSaving || !newName.trim()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
