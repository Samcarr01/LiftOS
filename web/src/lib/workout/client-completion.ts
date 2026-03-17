'use client';

import type {
  ActiveExerciseState,
  ActiveWorkoutState,
  AISuggestionData,
  SetEntry,
  SetType,
  SetValues,
} from '@/types/app';
import type { Json } from '@/types/database';

export type PersonalRecordType =
  | 'best_weight'
  | 'best_reps_at_weight'
  | 'best_e1rm'
  | 'best_volume';

export interface CompletionSummary {
  exercise_count: number;
  total_sets: number;
  total_volume_kg: number;
  duration_seconds: number;
}

export interface DetectedPR {
  exercise_id: string;
  exercise_name: string;
  record_type: PersonalRecordType;
  record_value: number;
}

interface SnapshotRow {
  user_id: string;
  exercise_id: string;
  session_id: string;
  sets_data: Json;
  performed_at: string;
}

interface PersonalRecordRow {
  user_id: string;
  exercise_id: string;
  record_type: PersonalRecordType;
  record_value: number;
  achieved_at: string;
  session_id: string;
}

interface SuggestionRow {
  user_id: string;
  exercise_id: string;
  suggestion_data: Json;
  history_snapshot: Json;
  model_version: string;
  expires_at: string;
}

const PROGRESSION_SET_TYPES = new Set<SetType>(['working', 'top']);

function roundQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function incrementByPercent(value: number, percent: number, minimum: number): number {
  return roundQuarter(value + Math.max(value * percent, minimum));
}

function getCompletedSets(exercise: ActiveExerciseState): SetEntry[] {
  return exercise.sets.filter((set) => set.isCompleted);
}

function getProgressionSets(exercise: ActiveExerciseState): SetEntry[] {
  const completedSets = getCompletedSets(exercise);
  const workingSets = completedSets.filter((set) => PROGRESSION_SET_TYPES.has(set.setType));
  return workingSets.length > 0 ? workingSets : completedSets;
}

function allProgressionSetsCompleted(exercise: ActiveExerciseState): boolean {
  const workingSets = exercise.sets.filter((set) => PROGRESSION_SET_TYPES.has(set.setType));
  const relevantSets = workingSets.length > 0 ? workingSets : exercise.sets;
  return relevantSets.length > 0 && relevantSets.every((set) => set.isCompleted);
}

function getSchemaKeys(exercise: ActiveExerciseState): string[] {
  return exercise.exercise.tracking_schema.fields.map((field) => field.key);
}

function getNumericValue(values: SetValues, key: string): number {
  const raw = values[key];
  return typeof raw === 'number' ? raw : 0;
}

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export function buildCompletionSummary(workout: ActiveWorkoutState): CompletionSummary {
  const totalSets = workout.exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.isCompleted).length,
    0,
  );

  const totalVolumeKg = workout.exercises.reduce((total, exercise) => (
    total + exercise.sets
      .filter((set) => set.isCompleted)
      .reduce((exerciseTotal, set) => {
        const weight = getNumericValue(set.values, 'weight');
        const reps = getNumericValue(set.values, 'reps');
        return exerciseTotal + (weight > 0 && reps > 0 ? weight * reps : 0);
      }, 0)
  ), 0);

  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(workout.session.started_at).getTime()) / 1000),
  );

  return {
    exercise_count: workout.exercises.length,
    total_sets: totalSets,
    total_volume_kg: +totalVolumeKg.toFixed(1),
    duration_seconds: durationSeconds,
  };
}

export function buildSnapshotRows(
  workout: ActiveWorkoutState,
  userId: string,
  performedAt: string,
): SnapshotRow[] {
  return workout.exercises.flatMap((exercise) => {
    const completedSets = getCompletedSets(exercise);
    if (completedSets.length === 0) return [];

    return [{
      user_id: userId,
      exercise_id: exercise.exercise.id,
      session_id: workout.session.id,
      sets_data: completedSets.map((set) => ({
        set_index: set.setIndex,
        values: set.values,
        set_type: set.setType,
      })),
      performed_at: performedAt,
    }];
  });
}

export function detectPersonalRecords(
  workout: ActiveWorkoutState,
  existingRows: Array<{ exercise_id: string; record_type: PersonalRecordType; record_value: number }>,
  userId: string,
  achievedAt: string,
): { newPrs: DetectedPR[]; rows: PersonalRecordRow[] } {
  const existingByExercise = new Map<string, Map<PersonalRecordType, number>>();

  for (const row of existingRows) {
    if (!existingByExercise.has(row.exercise_id)) {
      existingByExercise.set(row.exercise_id, new Map());
    }
    existingByExercise.get(row.exercise_id)!.set(row.record_type, Number(row.record_value));
  }

  const newPrs: DetectedPR[] = [];
  const rows: PersonalRecordRow[] = [];

  for (const exercise of workout.exercises) {
    const progressionSets = getProgressionSets(exercise);
    const weightedSets = progressionSets.filter((set) => {
      const weight = getNumericValue(set.values, 'weight');
      const reps = getNumericValue(set.values, 'reps');
      return weight > 0 && reps > 0;
    });

    if (weightedSets.length === 0) continue;

    const existing = existingByExercise.get(exercise.exercise.id) ?? new Map<PersonalRecordType, number>();

    const maxWeight = Math.max(...weightedSets.map((set) => getNumericValue(set.values, 'weight')));
    const topWeightSet = weightedSets.find(
      (set) => getNumericValue(set.values, 'weight') === maxWeight,
    );
    const maxRepsAtWeight = getNumericValue(topWeightSet?.values ?? {}, 'reps');
    const maxE1rm = Math.max(...weightedSets.map((set) =>
      epley(getNumericValue(set.values, 'weight'), getNumericValue(set.values, 'reps')),
    ));
    const volume = weightedSets.reduce(
      (total, set) => total + getNumericValue(set.values, 'weight') * getNumericValue(set.values, 'reps'),
      0,
    );

    const candidates: Array<[PersonalRecordType, number]> = [
      ['best_weight', maxWeight],
      ['best_reps_at_weight', maxRepsAtWeight],
      ['best_e1rm', +maxE1rm.toFixed(2)],
      ['best_volume', +volume.toFixed(1)],
    ];

    for (const [recordType, recordValue] of candidates) {
      const currentBest = existing.get(recordType) ?? 0;
      if (recordValue <= currentBest) continue;

      newPrs.push({
        exercise_id: exercise.exercise.id,
        exercise_name: exercise.exercise.name,
        record_type: recordType,
        record_value: recordValue,
      });

      rows.push({
        user_id: userId,
        exercise_id: exercise.exercise.id,
        record_type: recordType,
        record_value: recordValue,
        achieved_at: achievedAt,
        session_id: workout.session.id,
      });
    }
  }

  return { newPrs, rows };
}

function buildSuggestionForExercise(exercise: ActiveExerciseState): AISuggestionData | null {
  const progressionSets = getProgressionSets(exercise);
  if (progressionSets.length === 0) return null;

  const keys = getSchemaKeys(exercise);
  const completed = allProgressionSetsCompleted(exercise);

  if (keys.includes('weight') && keys.includes('reps')) {
    const bestWeight = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'weight')));
    const topSet = progressionSets.find((set) => getNumericValue(set.values, 'weight') === bestWeight);
    const reps = getNumericValue(topSet?.values ?? {}, 'reps');

    return completed
      ? {
          primary: {
            weight: incrementByPercent(bestWeight, 0.03, 1.25),
            reps,
            rationale: `You completed all working sets. Increase the load slightly next time.`,
          },
          alternative: {
            weight: bestWeight,
            reps: reps + 1,
            rationale: 'If the heavier jump feels too aggressive, keep the same load and add a rep.',
          },
          plateau_flag: false,
        }
      : {
          primary: {
            weight: bestWeight,
            reps,
            rationale: 'Keep the same target next time and complete every working set cleanly.',
          },
          alternative: null,
          plateau_flag: false,
        };
  }

  if (keys.includes('weight') && keys.includes('laps')) {
    const bestWeight = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'weight')));
    const topSet = progressionSets.find((set) => getNumericValue(set.values, 'weight') === bestWeight);
    const laps = getNumericValue(topSet?.values ?? {}, 'laps');

    return completed
      ? {
          primary: {
            weight: incrementByPercent(bestWeight, 0.03, 1.25),
            laps,
            rationale: 'You completed all loaded laps. Increase the load a little next time.',
          },
          alternative: {
            weight: bestWeight,
            laps: laps + 1,
            rationale: 'Or keep the same load and add a lap.',
          },
          plateau_flag: false,
        }
      : {
          primary: {
            weight: bestWeight,
            laps,
            rationale: 'Repeat the same load and lap target until every working set is done.',
          },
          alternative: null,
          plateau_flag: false,
        };
  }

  if (keys.includes('added_weight') && keys.includes('reps')) {
    const bestAddedWeight = Math.max(
      ...progressionSets.map((set) => getNumericValue(set.values, 'added_weight')),
    );
    const topSet = progressionSets.find(
      (set) => getNumericValue(set.values, 'added_weight') === bestAddedWeight,
    );
    const reps = getNumericValue(topSet?.values ?? {}, 'reps');

    if (completed && bestAddedWeight > 0) {
      return {
        primary: {
          added_weight: incrementByPercent(bestAddedWeight, 0.03, 1.25),
          reps,
          rationale: 'You completed all the work. Add a small amount of external load next time.',
        },
        alternative: {
          added_weight: bestAddedWeight,
          reps: reps + 1,
          rationale: 'Or keep the same external load and add a rep.',
        },
        plateau_flag: false,
      };
    }

    if (completed) {
      const bestReps = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'reps')));
      return {
        primary: {
          reps: bestReps + 1,
          rationale: 'You completed the bodyweight work. Add one rep next time.',
        },
        alternative: {
          added_weight: 1.25,
          reps: bestReps,
          rationale: 'Or add a small external load and keep reps the same.',
        },
        plateau_flag: false,
      };
    }

    return {
      primary: {
        added_weight: bestAddedWeight > 0 ? bestAddedWeight : undefined,
        reps,
        rationale: 'Keep the same bodyweight target until every working set is complete.',
      },
      alternative: null,
      plateau_flag: false,
    };
  }

  if (keys.includes('laps')) {
    const laps = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'laps')));
    return completed
      ? {
          primary: {
            laps: laps + 1,
            rationale: 'You completed the lap target. Add one lap next time.',
          },
          alternative: {
            laps,
            rationale: 'Or keep the same lap target and make the effort cleaner.',
          },
          plateau_flag: false,
        }
      : {
          primary: {
            laps,
            rationale: 'Keep the same lap target next time and finish every set.',
          },
          alternative: null,
          plateau_flag: false,
        };
  }

  if (keys.includes('distance') && keys.includes('duration')) {
    const bestDistance = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'distance')));
    const topSet = progressionSets.find(
      (set) => getNumericValue(set.values, 'distance') === bestDistance,
    );
    const duration = getNumericValue(topSet?.values ?? {}, 'duration');

    return completed
      ? {
          primary: {
            distance: roundToStep(bestDistance * 1.05, 10),
            duration: duration || undefined,
            rationale: 'You finished the distance target. Add a small distance bump next time.',
          },
          alternative: {
            distance: bestDistance,
            duration: duration || undefined,
            rationale: 'Or keep the same distance and make the whole effort smoother.',
          },
          plateau_flag: false,
        }
      : {
          primary: {
            distance: bestDistance,
            duration: duration || undefined,
            rationale: 'Keep the same distance target next time until every set is complete.',
          },
          alternative: null,
          plateau_flag: false,
        };
  }

  if (keys.includes('distance')) {
    const distance = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'distance')));
    return completed
      ? {
          primary: {
            distance: roundToStep(distance * 1.05, 10),
            rationale: 'You completed the distance target. Add a little more next time.',
          },
          alternative: {
            distance,
            rationale: 'Or keep the same distance and make it feel easier.',
          },
          plateau_flag: false,
        }
      : {
          primary: {
            distance,
            rationale: 'Keep the same distance target next time until every set is complete.',
          },
          alternative: null,
          plateau_flag: false,
        };
  }

  if (keys.includes('duration')) {
    const duration = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'duration')));
    return completed
      ? {
          primary: {
            duration: duration + 5,
            rationale: 'You completed the time target. Add a few seconds next time.',
          },
          alternative: {
            duration,
            rationale: 'Or hold the same time and make the set cleaner.',
          },
          plateau_flag: false,
        }
      : {
          primary: {
            duration,
            rationale: 'Keep the same time target next time until every set is complete.',
          },
          alternative: null,
          plateau_flag: false,
        };
  }

  if (keys.includes('reps')) {
    const reps = Math.max(...progressionSets.map((set) => getNumericValue(set.values, 'reps')));
    return completed
      ? {
          primary: {
            reps: reps + 1,
            rationale: 'You completed the rep target. Add one rep next time.',
          },
          alternative: {
            reps,
            rationale: 'Or keep the same reps and make the set cleaner.',
          },
          plateau_flag: false,
        }
      : {
          primary: {
            reps,
            rationale: 'Keep the same rep target next time until every set is complete.',
          },
          alternative: null,
          plateau_flag: false,
        };
  }

  return null;
}

export function buildSuggestionRows(
  workout: ActiveWorkoutState,
  userId: string,
  generatedAt: string,
): SuggestionRow[] {
  const expiresAt = new Date(generatedAt);
  expiresAt.setDate(expiresAt.getDate() + 7);

  return workout.exercises.flatMap((exercise) => {
    const suggestion = buildSuggestionForExercise(exercise);
    if (!suggestion) return [];

    return [{
      user_id: userId,
      exercise_id: exercise.exercise.id,
      suggestion_data: suggestion,
      history_snapshot: {
        source: 'client-rule-based',
        generated_at: generatedAt,
        session_id: workout.session.id,
      },
      model_version: 'client-rule-based',
      expires_at: expiresAt.toISOString(),
    }];
  });
}
