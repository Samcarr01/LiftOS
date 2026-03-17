'use client';

import { useMemo, useState } from 'react';
import { Archive, Loader2, Pencil, Save, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { useExercises } from '@/hooks/use-exercises';
import {
  describeTrackingSchema,
  groupExercisesByName,
  normalizeExerciseName,
} from '@/lib/workout/formatting';

export default function ExercisesPage() {
  const {
    exercises,
    isLoading,
    updateExercise,
    archiveExercise,
  } = useExercises();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

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

  function startEditing(id: string, currentName: string) {
    setEditingId(id);
    setDraftName(currentName);
  }

  async function saveName(id: string) {
    const nextName = draftName.trim();
    if (!nextName) {
      toast.error('Exercise name is required.');
      return;
    }

    try {
      await updateExercise(id, { name: nextName });
      toast.success('Exercise renamed');
      setEditingId(null);
      setDraftName('');
    } catch (error) {
      toast.error((error as { message?: string }).message ?? 'Failed to rename exercise');
    }
  }

  async function handleArchive(id: string, name: string) {
    if (!confirm(`Archive "${name}"? It will disappear from your active exercise list.`)) return;

    try {
      await archiveExercise(id);
      toast.success('Exercise archived');
    } catch (error) {
      toast.error((error as { message?: string }).message ?? 'Failed to archive exercise');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h1 className="text-2xl font-bold tracking-tight">Your Exercises</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Browse every exercise you have created, search quickly, and clean up duplicate names.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, muscle group, or tracking type"
            className="h-11 pl-9"
          />
        </div>
      </div>

      {duplicateGroups.length > 0 && (
        <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="text-sm font-semibold text-yellow-300">Duplicate exercise names found</p>
          <p className="mt-1 text-sm text-yellow-100/80">
            Rename or archive the extras so Progress and workout selection stay easier to use.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {duplicateGroups.map((group) => (
              <span
                key={group.id}
                className="rounded-full border border-yellow-500/30 px-3 py-1 text-xs font-medium text-yellow-100"
              >
                {group.name} ({group.duplicateCount})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredExercises.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-semibold">No exercises match that search</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another name or muscle group.</p>
          </div>
        ) : (
          filteredExercises.map((exercise) => {
            const isEditing = editingId === exercise.id;
            const isDuplicate = duplicateNames.has(normalizeExerciseName(exercise.name));

            return (
              <div key={exercise.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Input
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          className="h-10"
                          autoFocus
                        />
                        <button
                          onClick={() => void saveName(exercise.id)}
                          className="flex h-10 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          <Save className="h-4 w-4" />
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setDraftName('');
                          }}
                          className="flex h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{exercise.name}</h2>
                        {isDuplicate && (
                          <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-medium text-yellow-300">
                            Duplicate name
                          </span>
                        )}
                      </div>
                    )}

                    <p className="mt-2 text-sm text-muted-foreground">
                      {describeTrackingSchema(exercise.tracking_schema)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {exercise.muscle_groups.length > 0 ? (
                        exercise.muscle_groups.map((muscle) => (
                          <MuscleGroupBadge key={muscle} muscle={muscle} />
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No muscle groups added</span>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(exercise.id, exercise.name)}
                        className="flex h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                        Rename
                      </button>
                      <button
                        onClick={() => void handleArchive(exercise.id, exercise.name)}
                        className="flex h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
