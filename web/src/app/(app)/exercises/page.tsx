'use client';

import { useMemo, useState } from 'react';
import { Archive, Loader2, Pencil, Save, Search, Sparkles, X } from 'lucide-react';
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
      <div className="page-content py-5 md:py-7">
        <section className="page-hero">
          <span className="hero-kicker">Exercises</span>
          <h1 className="page-title mt-4">Keep your exercise list clean and obvious</h1>
          <p className="page-subtitle mt-3">
            This is your exercise list, not a random public library. Search it, rename things so they make sense, and archive duplicates that are cluttering Progress and workout creation.
          </p>
          {!isLoading && exercises.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="status-pill">{exercises.length} active exercise{exercises.length !== 1 ? 's' : ''}</span>
              {duplicateGroups.length > 0 && (
                <span className="status-pill border-yellow-500/25 bg-yellow-500/10 text-yellow-300">
                  {duplicateGroups.length} duplicate name{duplicateGroups.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </section>

        <div className="mt-8 space-y-8">
          <section className="section-shell">
            <div className="premium-card page-reveal delay-2 px-4 py-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, muscle group, or tracking type"
                  className="h-12 rounded-2xl border-white/10 bg-black/15 pl-11"
                />
              </div>
            </div>
          </section>

          {duplicateGroups.length > 0 && (
            <section className="section-shell">
              <div className="premium-card page-reveal delay-3 px-5 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-500/12 text-yellow-300">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-semibold">Duplicate exercise names found</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Rename or archive the extras so Progress and workout selection stay clear and easy to use.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {duplicateGroups.map((group) => (
                        <span
                          key={group.id}
                          className="status-pill border-yellow-500/25 bg-yellow-500/10 text-yellow-300"
                        >
                          {group.name} ({group.duplicateCount})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="section-shell">
            <div className="section-heading">
              <div>
                <h2 className="section-title">Your Exercise List</h2>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/75">
                  rename, review, archive
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredExercises.length === 0 ? (
              <div className="premium-card page-reveal delay-2 px-5 py-12 text-center">
                <p className="font-display text-2xl font-semibold">No exercises match that search</p>
                <p className="mt-2 text-sm text-muted-foreground">Try another name or muscle group.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredExercises.map((exercise, index) => {
                  const isEditing = editingId === exercise.id;
                  const isDuplicate = duplicateNames.has(normalizeExerciseName(exercise.name));

                  return (
                    <div key={exercise.id} className={`premium-card page-reveal delay-${Math.min(index + 1, 4)} px-5 py-5`}>
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex flex-col gap-3 md:flex-row">
                              <Input
                                value={draftName}
                                onChange={(event) => setDraftName(event.target.value)}
                                className="h-11 rounded-2xl border-white/10 bg-black/15"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => void saveName(exercise.id)}
                                  className="premium-button px-4"
                                >
                                  <Save className="h-4 w-4" />
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingId(null);
                                    setDraftName('');
                                  }}
                                  className="premium-button-secondary px-4"
                                >
                                  <X className="h-4 w-4" />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-display text-2xl font-semibold">{exercise.name}</h2>
                              {isDuplicate && (
                                <span className="status-pill border-yellow-500/25 bg-yellow-500/10 text-yellow-300">
                                  Duplicate Name
                                </span>
                              )}
                            </div>
                          )}

                          <p className="mt-2 text-sm text-muted-foreground">
                            {describeTrackingSchema(exercise.tracking_schema)}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-1.5">
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
                              className="premium-button-secondary px-4"
                            >
                              <Pencil className="h-4 w-4" />
                              Rename
                            </button>
                            <button
                              onClick={() => void handleArchive(exercise.id, exercise.name)}
                              className="premium-button-secondary px-4 text-destructive hover:text-destructive"
                            >
                              <Archive className="h-4 w-4" />
                              Archive
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
