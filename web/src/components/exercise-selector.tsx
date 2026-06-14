'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Loader2, Dumbbell } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { ExerciseForm } from '@/components/exercise/exercise-form';
import { useExercises } from '@/hooks/use-exercises';
import type { ExerciseWithSchema, ExerciseCreate } from '@/types/app';
import { ExerciseCreateSchema } from '@/lib/validation';
import { describeTrackingSchema } from '@/lib/workout/formatting';
import { TRACKING_PRESETS } from '@/types/tracking';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ALL_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Core', 'Calves', 'Cardio', 'Forearms'];

export interface ExerciseSelectionOptions {
  defaultSetCount: number;
}

interface Props {
  onSelect: (exercise: ExerciseWithSchema, options: ExerciseSelectionOptions) => void;
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

  // Starting sets only persists when adding to a workout (not the library's own create).
  const showStartingSets = defaultMode !== 'create';

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setSearch('');
    setMuscleFilter(null);
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

  function handleSelect(exercise: ExerciseWithSchema, defaultSetCount = 3) {
    onSelect(exercise, { defaultSetCount });
    setOpen(false);
    setMode(defaultMode);
    setSearch('');
    setMuscleFilter(null);
  }

  async function handleCreate(values: {
    name: string;
    muscleGroups: string[];
    preset: keyof typeof TRACKING_PRESETS;
    notes: string;
    startingSets?: number;
  }) {
    try {
      const data: ExerciseCreate = ExerciseCreateSchema.parse({
        name: values.name,
        muscle_groups: values.muscleGroups,
        tracking_schema: TRACKING_PRESETS[values.preset],
        notes: values.notes || null,
      });
      const exercise = await createExercise(data);
      toast.success(`"${exercise.name}" created`);
      handleSelect(exercise, values.startingSets ?? 3);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to create exercise');
    }
  }

  return (
    <>
      {/* Wrap trigger in a click handler since @base-ui SheetTrigger doesn't support asChild */}
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="flex !h-[100dvh] flex-col p-0">
          <SheetHeader className="border-b border-border px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              {/* Standard back-nav: create-from-browse steps back to the list;
                  otherwise it closes the picker and returns to where it opened. */}
              <BackButton
                onClick={() => {
                  if (mode === 'create' && defaultMode !== 'create') setMode('browse');
                  else setOpen(false);
                }}
                label={mode === 'create' && defaultMode !== 'create' ? 'Back to your exercises' : 'Close'}
              />
              <SheetTitle className="font-display text-xl font-bold">
                {mode === 'create' ? 'New Exercise' : 'Your Exercises'}
              </SheetTitle>
              {mode === 'browse' && (
                <button
                  onClick={() => setMode('create')}
                  className="ml-auto flex h-9 cursor-pointer items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              )}
            </div>
          </SheetHeader>

          {/* ── Browse mode ───────────────────────────────────── */}
          {mode === 'browse' && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Search */}
              <div className="px-4 pt-4 pb-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                  <Input
                    placeholder="Search your exercises"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 rounded-2xl border-white/10 bg-white/[0.06] pl-10 text-sm"
                  />
                </div>
              </div>

              {/* Muscle filter chips */}
              <div className="relative">
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
                {/* Right-edge fade hints there are more chips to scroll to */}
                <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
              </div>

              {/* Exercise list — same card design as the Exercise Library */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <Dumbbell className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No exercises found</p>
                    <button
                      onClick={() => setMode('create')}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {search.trim() ? `Create "${search.trim()}"` : 'Create one instead'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => handleSelect(ex)}
                        className="list-row flex-col items-stretch gap-1"
                      >
                        <p className="truncate text-card-title">{ex.name}</p>
                        <p className="text-sm text-muted-foreground">{describeTrackingSchema(ex.tracking_schema)}</p>
                        {ex.muscle_groups.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {ex.muscle_groups.map((m) => (
                              <MuscleGroupBadge key={m} muscle={m} />
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Create mode ───────────────────────────────────── */}
          {mode === 'create' && (
            <ExerciseForm
              initialName={search.trim()}
              showStartingSets={showStartingSets}
              submitLabel="Create Exercise"
              onSubmit={handleCreate}
              autoFocus
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
