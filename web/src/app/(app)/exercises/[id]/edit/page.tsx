'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '@/components/ui/back-button';
import { ExerciseForm, type ExerciseFormValues } from '@/components/exercise/exercise-form';
import { useExercises } from '@/hooks/use-exercises';
import { TRACKING_PRESETS, type TrackingPresetKey } from '@/types/tracking';
import type { ExerciseWithSchema } from '@/types/app';

const PRESET_KEYS = Object.keys(TRACKING_PRESETS) as TrackingPresetKey[];

/** Match an exercise's stored schema back to a known preset so the form
 *  pre-selects the right tracking type (incl. legacy Height + Reps). */
function detectPresetKey(exercise: ExerciseWithSchema): TrackingPresetKey | null {
  const fieldKeys = exercise.tracking_schema.fields.map((f) => f.key).sort().join(',');
  for (const key of PRESET_KEYS) {
    const presetKeys = TRACKING_PRESETS[key].fields.map((f) => f.key).sort().join(',');
    if (fieldKeys === presetKeys) return key;
  }
  return null;
}

/**
 * Full-page Edit Exercise. Mirrors Create but pre-fills from the existing row
 * and offers the legacy "Height + Reps" tracking type so exercises already on
 * it aren't silently converted on save.
 */
export default function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { exercises, isLoading, updateExercise } = useExercises();

  const exercise = exercises.find((e) => e.id === id);

  async function handleSubmit(values: ExerciseFormValues) {
    if (!exercise) return;
    try {
      await updateExercise(exercise.id, {
        name: values.name,
        muscle_groups: values.muscleGroups,
        tracking_schema: TRACKING_PRESETS[values.preset],
        notes: values.notes || null,
      });
      toast.success('Exercise updated');
      router.push('/exercises');
    } catch (err) {
      toast.error((err as { message?: string }).message ?? 'Failed to update exercise');
    }
  }

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-2xl flex-col md:max-w-3xl">
        <header className="flex items-center gap-3 px-5 pt-4 pb-2">
          <BackButton href="/exercises" label="Back to exercises" />
          <h1 className="font-display text-xl font-bold">Edit Exercise</h1>
        </header>

        {isLoading && !exercise ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !exercise ? (
          <p className="px-5 py-10 text-sm text-muted-foreground">Exercise not found.</p>
        ) : (
          <ExerciseForm
            initialName={exercise.name}
            initialMuscleGroups={exercise.muscle_groups}
            initialPreset={detectPresetKey(exercise) ?? 'WEIGHT_REPS'}
            initialNotes={exercise.notes ?? ''}
            allowLegacyTracking
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
