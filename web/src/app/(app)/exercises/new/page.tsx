'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BackButton } from '@/components/ui/back-button';
import { ExerciseForm, type ExerciseFormValues } from '@/components/exercise/exercise-form';
import { useExercises } from '@/hooks/use-exercises';
import { TRACKING_PRESETS } from '@/types/tracking';

/**
 * Full-page Create Exercise. Replaces the old bottom-sheet so the form has room
 * to breathe and the back-nav is consistent with the rest of the app.
 */
export default function NewExercisePage() {
  const router = useRouter();
  const { createExercise } = useExercises();

  async function handleSubmit(values: ExerciseFormValues) {
    try {
      await createExercise({
        name: values.name,
        muscle_groups: values.muscleGroups,
        tracking_schema: TRACKING_PRESETS[values.preset],
        unit_config: {},
        default_rest_seconds: 90,
        notes: values.notes || null,
      });
      toast.success('Exercise created');
      router.push('/exercises');
    } catch (err) {
      toast.error((err as { message?: string }).message ?? 'Failed to create exercise');
    }
  }

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-2xl flex-col md:max-w-3xl">
        <header className="flex items-center gap-3 px-5 pt-4 pb-2">
          <BackButton href="/exercises" label="Back to exercises" />
          <h1 className="font-display text-xl font-bold">New Exercise</h1>
        </header>
        <ExerciseForm submitLabel="Create Exercise" onSubmit={handleSubmit} autoFocus />
      </div>
    </div>
  );
}
