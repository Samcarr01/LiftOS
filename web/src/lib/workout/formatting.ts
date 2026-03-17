import type { SetType, SetValues } from '@/types/app';
import type { TrackingField, TrackingSchema } from '@/types/tracking';

export interface TrackingSetLike {
  set_index?: number;
  values: SetValues;
  set_type?: SetType | string;
  is_completed?: boolean;
  logged_at?: string | null;
}

export interface GroupedExerciseOption {
  id: string;
  name: string;
  exerciseIds: string[];
  duplicateCount: number;
  muscleGroups: string[];
  trackingLabel: string;
}

function hasValue(value: number | string | null | undefined): boolean {
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function getNumericValue(values: SetValues, key: string): number {
  const raw = values[key];
  return typeof raw === 'number' ? raw : 0;
}

function keySet(schema: TrackingSchema): Set<string> {
  return new Set(schema.fields.map((field) => field.key));
}

function compareNumbers(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function formatFieldLabel(field: TrackingField): string {
  if (!field.unit) return field.label;
  if (field.unit === 'seconds') return `${field.label} (sec)`;
  if (field.unit === 'metres') return `${field.label} (m)`;
  return `${field.label} (${field.unit})`;
}

export function describeTrackingSchema(schema: TrackingSchema): string {
  const keys = schema.fields.map((field) => field.key);

  if (keys.includes('weight') && keys.includes('reps')) return 'Weight and reps';
  if (keys.includes('weight') && keys.includes('laps')) return 'Weight and laps';
  if (keys.includes('added_weight') && keys.includes('reps')) return 'Bodyweight reps';
  if (keys.includes('distance') && keys.includes('duration')) return 'Distance and time';
  if (keys.includes('distance')) return 'Distance';
  if (keys.includes('duration')) return 'Time';
  if (keys.includes('laps')) return 'Laps';
  if (keys.includes('reps')) return 'Reps';

  return schema.fields.map((field) => field.label).join(', ');
}

export function formatFieldValue(field: TrackingField, rawValue: number | string): string {
  if (field.key === 'added_weight' && typeof rawValue === 'number') {
    return `+${rawValue}${field.unit ?? ''}`;
  }

  if (typeof rawValue === 'number') {
    if (field.unit === 'kg' || field.unit === 'lb') return `${rawValue}${field.unit}`;
    if (field.unit === 'seconds') return `${rawValue}s`;
    if (field.unit === 'metres') return `${rawValue}m`;
  }

  if (field.key === 'reps') return `${rawValue} reps`;
  if (field.key === 'laps') return `${rawValue} laps`;
  if (field.unit) return `${rawValue} ${field.unit}`;

  return `${rawValue} ${field.label.toLowerCase()}`;
}

export function formatSetValues(
  values: SetValues,
  schema: TrackingSchema,
  options?: { includeLabels?: boolean; emptyLabel?: string },
): string {
  const parts = schema.fields.flatMap((field) => {
    const rawValue = values[field.key];
    if (!hasValue(rawValue as number | string | null | undefined)) return [];

    const formatted = formatFieldValue(field, rawValue as number | string);
    return options?.includeLabels ? [`${field.label}: ${formatted}`] : [formatted];
  });

  return parts.join(' x ') || options?.emptyLabel || 'No result logged';
}

export function formatLastSetValues(values: SetValues, schema: TrackingSchema): string {
  return formatSetValues(values, schema, { emptyLabel: 'No previous result' });
}

export function pickRepresentativeSet(
  sets: TrackingSetLike[],
  schema: TrackingSchema,
  mode: 'best' | 'latest' = 'best',
): TrackingSetLike | null {
  const completedSets = sets.filter((set) => {
    if (set.is_completed === false) return false;
    return schema.fields.some((field) => hasValue(set.values[field.key]));
  });

  if (completedSets.length === 0) return null;
  if (mode === 'latest') return completedSets[completedSets.length - 1] ?? null;

  const keys = keySet(schema);

  return completedSets.reduce<TrackingSetLike | null>((best, current) => {
    if (!best) return current;

    const a = current.values;
    const b = best.values;

    if (keys.has('weight') && keys.has('reps')) {
      const weightComparison = compareNumbers(getNumericValue(a, 'weight'), getNumericValue(b, 'weight'));
      if (weightComparison !== 0) return weightComparison > 0 ? current : best;
      return compareNumbers(getNumericValue(a, 'reps'), getNumericValue(b, 'reps')) > 0 ? current : best;
    }

    if (keys.has('weight') && keys.has('laps')) {
      const weightComparison = compareNumbers(getNumericValue(a, 'weight'), getNumericValue(b, 'weight'));
      if (weightComparison !== 0) return weightComparison > 0 ? current : best;
      return compareNumbers(getNumericValue(a, 'laps'), getNumericValue(b, 'laps')) > 0 ? current : best;
    }

    if (keys.has('added_weight') && keys.has('reps')) {
      const weightComparison = compareNumbers(getNumericValue(a, 'added_weight'), getNumericValue(b, 'added_weight'));
      if (weightComparison !== 0) return weightComparison > 0 ? current : best;
      return compareNumbers(getNumericValue(a, 'reps'), getNumericValue(b, 'reps')) > 0 ? current : best;
    }

    if (keys.has('distance') && keys.has('duration')) {
      const distanceComparison = compareNumbers(getNumericValue(a, 'distance'), getNumericValue(b, 'distance'));
      if (distanceComparison !== 0) return distanceComparison > 0 ? current : best;
      const durationComparison = compareNumbers(getNumericValue(b, 'duration'), getNumericValue(a, 'duration'));
      return durationComparison > 0 ? current : best;
    }

    if (keys.has('distance')) {
      return compareNumbers(getNumericValue(a, 'distance'), getNumericValue(b, 'distance')) > 0 ? current : best;
    }

    if (keys.has('duration')) {
      return compareNumbers(getNumericValue(a, 'duration'), getNumericValue(b, 'duration')) > 0 ? current : best;
    }

    if (keys.has('laps')) {
      return compareNumbers(getNumericValue(a, 'laps'), getNumericValue(b, 'laps')) > 0 ? current : best;
    }

    if (keys.has('reps')) {
      return compareNumbers(getNumericValue(a, 'reps'), getNumericValue(b, 'reps')) > 0 ? current : best;
    }

    return current;
  }, null);
}

export function summarizeSetResult(
  sets: TrackingSetLike[],
  schema: TrackingSchema,
  mode: 'best' | 'latest' = 'best',
): string | null {
  const representative = pickRepresentativeSet(sets, schema, mode);
  return representative ? formatSetValues(representative.values, schema) : null;
}

export function computeVolumeKg(values: SetValues): number {
  const weight = typeof values.weight === 'number' ? values.weight : 0;
  const reps = typeof values.reps === 'number' ? values.reps : 0;
  return weight > 0 && reps > 0 ? weight * reps : 0;
}

export function groupExercisesByName<T extends {
  id: string;
  name: string;
  muscle_groups?: string[];
  tracking_schema?: TrackingSchema;
}>(exercises: T[]): GroupedExerciseOption[] {
  const grouped = new Map<string, GroupedExerciseOption>();

  for (const exercise of exercises) {
    const normalized = normalizeExerciseName(exercise.name);
    const existing = grouped.get(normalized);

    if (!existing) {
      grouped.set(normalized, {
        id: normalized,
        name: exercise.name.trim(),
        exerciseIds: [exercise.id],
        duplicateCount: 1,
        muscleGroups: [...new Set(exercise.muscle_groups ?? [])],
        trackingLabel: exercise.tracking_schema
          ? describeTrackingSchema(exercise.tracking_schema)
          : 'Exercise',
      });
      continue;
    }

    existing.exerciseIds.push(exercise.id);
    existing.duplicateCount += 1;
    existing.muscleGroups = [...new Set([...existing.muscleGroups, ...(exercise.muscle_groups ?? [])])];
  }

  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
}
