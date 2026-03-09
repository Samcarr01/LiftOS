/**
 * Lightweight module-level store for returning an exercise selection back to
 * the screen that opened ExerciseSelector.
 *
 * Pattern:
 *   // Caller registers a one-shot callback before navigating
 *   registerExerciseCallback((ex) => addExerciseToTemplate(ex));
 *   router.push('/(tabs)/templates/exercise-selector');
 *
 *   // ExerciseSelector calls this when user picks an exercise
 *   resolveExerciseSelection(selectedExercise);  // fires callback, clears it
 */

import type { ExerciseWithSchema } from '@/types';

type SelectionCallback = (exercise: ExerciseWithSchema) => void;

let pendingCallback: SelectionCallback | null = null;

export function registerExerciseCallback(cb: SelectionCallback): void {
  pendingCallback = cb;
}

export function resolveExerciseSelection(exercise: ExerciseWithSchema): void {
  pendingCallback?.(exercise);
  pendingCallback = null;
}

export function hasExerciseCallback(): boolean {
  return pendingCallback !== null;
}
