import { isSupersetRoundComplete } from '../superset-card';
import type { ActiveExerciseState } from '@/types/app';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function exercise(keys: number[], completedPositions: number[]): ActiveExerciseState {
  return {
    sets: keys.map((setIndex, position) => ({
      id: `set-${setIndex}`,
      setIndex,
      isCompleted: completedPositions.includes(position),
    })),
  } as unknown as ActiveExerciseState;
}

console.log('Running sparse-key superset round tests...');

// After deleting a round, each exercise can have different immutable keys at
// the same visual round. Position 2 is still a complete paired round.
const first = exercise([0, 1, 3], [0, 1, 2]);
const second = exercise([0, 1, 2], [0, 1, 2]);
assert(
  isSupersetRoundComplete([first, second], 2),
  'A complete third displayed round starts rest even when paired persistence keys are 3 and 2',
);

const incompleteSecond = exercise([0, 1, 2], [0, 1]);
assert(
  !isSupersetRoundComplete([first, incompleteSecond], 2),
  'Rest waits until every exercise completes the same displayed round',
);

console.log('✓ Sparse-key superset rounds use display position, not persistence key');
