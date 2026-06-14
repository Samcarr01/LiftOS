'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
  const router = useRouter();
  const {
    exercises,
    isLoading,
    deleteExercise,
  } = useExercises();
  const [search, setSearch] = useState('');
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
              <span className="text-sm text-muted-foreground">
                {filteredExercises.length === exercises.length
                  ? `${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`
                  : `${filteredExercises.length} of ${exercises.length} exercises`}
              </span>
            )}
          </div>
          <button
            onClick={() => router.push('/exercises/new')}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
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

                  <div className="flex shrink-0 gap-1.5">
                    <Link
                      href={`/exercises/${exercise.id}`}
                      aria-label="View exercise statistics"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-primary/10 text-primary active:bg-primary/20 hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => router.push(`/exercises/${exercise.id}/edit`)}
                      aria-label="Edit exercise"
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 text-foreground/70 active:bg-white/[0.08] hover:bg-white/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(exercise.id)}
                      aria-label="Delete exercise"
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 text-foreground/70 active:bg-white/[0.08] hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation — modal, consistent with templates & history */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-[oklch(0.16_0.015_260)] p-5 space-y-4">
            <h3 className="font-display text-lg font-bold">Delete exercise?</h3>
            <p className="text-sm text-muted-foreground">
              &ldquo;{exercises.find((e) => e.id === confirmDeleteId)?.name ?? 'This exercise'}&rdquo; will be
              permanently deleted. This cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/90 text-sm font-semibold text-white transition-all duration-150 hover:bg-red-500 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" />
                Delete Exercise
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="premium-button-secondary w-full justify-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
