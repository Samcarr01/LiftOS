'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Check, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { ExerciseSelector } from '@/components/exercise-selector';
import { useExercises } from '@/hooks/use-exercises';
import {
  describeTrackingSchema,
  groupExercisesByName,
  normalizeExerciseName,
} from '@/lib/workout/formatting';
import {
  TRACKING_PRESETS,
  TRACKING_PRESET_LABELS,
  type TrackingPresetKey,
} from '@/types/tracking';
import type { ExerciseWithSchema } from '@/types/app';
import { cn } from '@/lib/utils';

const ALL_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Core', 'Calves', 'Cardio', 'Forearms'];
const PRESET_KEYS = Object.keys(TRACKING_PRESETS) as TrackingPresetKey[];

function detectPresetKey(exercise: ExerciseWithSchema): TrackingPresetKey | null {
  const fieldKeys = exercise.tracking_schema.fields.map((f) => f.key).sort().join(',');
  for (const key of PRESET_KEYS) {
    const presetKeys = TRACKING_PRESETS[key].fields.map((f) => f.key).sort().join(',');
    if (fieldKeys === presetKeys) return key;
  }
  return null;
}

function EditExerciseSheet({
  exercise,
  open,
  onClose,
  onSave,
}: {
  exercise: ExerciseWithSchema;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: { name?: string; muscle_groups?: string[]; tracking_schema?: { fields: { key: string; label: string; type: 'number' | 'text'; optional: boolean; unit?: string }[] }; notes?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(exercise.name);
  const [muscles, setMuscles] = useState<string[]>(exercise.muscle_groups);
  const [preset, setPreset] = useState<TrackingPresetKey>(detectPresetKey(exercise) ?? 'WEIGHT_REPS');
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [saving, setSaving] = useState(false);

  function toggleMuscle(m: string) {
    setMuscles((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await onSave(exercise.id, {
        name: name.trim(),
        muscle_groups: muscles,
        tracking_schema: TRACKING_PRESETS[preset],
        notes: notes.trim() || null,
      });
      toast.success('Exercise updated');
      onClose();
    } catch (err) {
      toast.error((err as { message?: string }).message ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
      <SheetContent side="bottom" className="flex !h-[100dvh] flex-col p-0">
        <SheetHeader className="border-b border-border px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <SheetTitle>Edit Exercise</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-8 pt-4 gap-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Exercise name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-xl border-white/10 bg-white/[0.06] px-4 text-base"
              autoFocus
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
              {PRESET_KEYS.map((key) => {
                const selected = preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
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

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Form cues, equipment notes…"
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus-visible:outline-none"
            />
          </div>

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="premium-button mt-auto justify-center disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ExercisesPage() {
  const {
    exercises,
    isLoading,
    fetchExercises,
    updateExercise,
    deleteExercise,
  } = useExercises();
  const [search, setSearch] = useState('');
  const [editingExercise, setEditingExercise] = useState<ExerciseWithSchema | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const duplicateGroups = useMemo(
    () => groupExercisesByName(exercises).filter((group) => group.duplicateCount > 1),
    [exercises],
  );
  const duplicateNames = useMemo(
    () => new Set(duplicateGroups.map((group) => normalizeExerciseName(group.name))),
    [duplicateGroups],
  );
  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return exercises;

    return exercises.filter((exercise) => (
      exercise.name.toLowerCase().includes(query)
      || exercise.muscle_groups.some((muscle) => muscle.toLowerCase().includes(query))
      || describeTrackingSchema(exercise.tracking_schema).toLowerCase().includes(query)
    ));
  }, [exercises, search]);

  async function handleDelete(id: string) {
    try {
      await deleteExercise(id);
      toast.success('Exercise deleted');
      setConfirmDeleteId(null);
    } catch (error) {
      toast.error((error as { message?: string }).message ?? 'Failed to delete exercise');
    }
  }

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-2">
            <h1 className="page-header-title">Exercise Library</h1>
            {!isLoading && exercises.length > 0 && (
              <span className="text-sm text-muted-foreground">{exercises.length} exercises</span>
            )}
          </div>
          <ExerciseSelector
            onSelect={() => void fetchExercises()}
            defaultMode="create"
            trigger={
              <button className="flex h-9 cursor-pointer items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            }
          />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, muscle group, or type"
            className="h-11 rounded-2xl border-white/10 bg-white/[0.06] backdrop-blur-xl pl-10 text-sm"
          />
        </div>

        {/* Duplicates warning */}
        {duplicateGroups.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.12)] px-4 py-4">
            <span className="text-xs font-semibold text-[oklch(0.82_0.15_60)]">Duplicates</span>
            <div className="flex flex-wrap gap-1.5">
              {duplicateGroups.map((group) => (
                <span
                  key={group.id}
                  className="inline-flex items-center rounded-md border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.12)] px-2 py-0.5 text-xs font-semibold text-[oklch(0.82_0.15_60)]"
                >
                  {group.name} ({group.duplicateCount})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Exercise list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredExercises.length === 0 ? (
          <div className="content-card py-8 text-center">
            <p className="text-card-title">No exercises match</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredExercises.map((exercise) => {
              const isDuplicate = duplicateNames.has(normalizeExerciseName(exercise.name));

              return (
                <div key={exercise.id} className="list-row flex-col items-stretch gap-2 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-card-title">{exercise.name}</p>
                      {isDuplicate && (
                        <span className="rounded-md border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.12)] px-1.5 py-0.5 text-xs font-semibold text-[oklch(0.82_0.15_60)]">
                          Dup
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{describeTrackingSchema(exercise.tracking_schema)}</p>
                    {exercise.muscle_groups.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {exercise.muscle_groups.map((muscle) => (
                          <MuscleGroupBadge key={muscle} muscle={muscle} />
                        ))}
                      </div>
                    )}
                  </div>

                  {confirmDeleteId === exercise.id ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm text-destructive font-medium">Delete?</span>
                      <button
                        onClick={() => void handleDelete(exercise.id)}
                        className="flex h-9 items-center gap-1 rounded-xl bg-destructive px-3 text-xs font-semibold text-white"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex h-9 items-center gap-1 rounded-xl border border-white/10 px-3 text-xs font-semibold text-muted-foreground"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 gap-1.5">
                      <Link
                        href={`/exercises/${exercise.id}`}
                        aria-label="View exercise statistics"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-muted-foreground active:bg-white/[0.08] hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => setEditingExercise(exercise)}
                        aria-label="Edit exercise"
                        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 text-muted-foreground active:bg-white/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(exercise.id)}
                        aria-label="Delete exercise"
                        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 text-muted-foreground active:bg-white/[0.08] hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit sheet */}
      {editingExercise && (
        <EditExerciseSheet
          key={editingExercise.id}
          exercise={editingExercise}
          open={!!editingExercise}
          onClose={() => setEditingExercise(null)}
          onSave={async (id, data) => {
            await updateExercise(id, data);
          }}
        />
      )}
    </div>
  );
}
