'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, BarChart3, Loader2, Pencil, Save, Search, X } from 'lucide-react';
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
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        {/* Header */}
        <div className="page-header">
          <h1 className="page-header-title">Exercise Library</h1>
          {!isLoading && exercises.length > 0 && (
            <span className="text-sm text-muted-foreground">{exercises.length} exercises</span>
          )}
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
              const isEditing = editingId === exercise.id;
              const isDuplicate = duplicateNames.has(normalizeExerciseName(exercise.name));

              return (
                <div key={exercise.id} className="list-row flex-col items-stretch gap-2 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex flex-col gap-2 md:flex-row">
                        <Input
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          className="h-9 rounded-2xl border-white/10 bg-white/[0.06] backdrop-blur-xl text-sm"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => void saveName(exercise.id)}
                            className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setDraftName(''); }}
                            className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs font-semibold text-muted-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="truncate text-card-title">{exercise.name}</p>
                          {isDuplicate && (
                            <span className="rounded-md border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.12)] px-1.5 py-0.5 text-xs font-semibold text-[oklch(0.82_0.15_60)]">
                              Dup
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{describeTrackingSchema(exercise.tracking_schema)}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {exercise.muscle_groups.length > 0 ? (
                            exercise.muscle_groups.map((muscle) => (
                              <MuscleGroupBadge key={muscle} muscle={muscle} />
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No muscle groups</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex shrink-0 gap-1.5">
                      <Link
                        href={`/exercises/${exercise.id}`}
                        className="flex h-9 items-center gap-1 rounded-xl border border-white/10 px-2.5 text-xs text-muted-foreground hover:text-primary"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => startEditing(exercise.id, exercise.name)}
                        className="flex h-9 items-center gap-1 rounded-xl border border-white/10 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void handleArchive(exercise.id, exercise.name)}
                        className="flex h-9 items-center gap-1 rounded-xl border border-white/10 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
