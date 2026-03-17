/**
 * Tracking schema types and preset constants.
 * Types are derived from Zod schemas (single source of truth).
 */

import type { z } from 'zod';
import type { TrackingFieldSchema, TrackingSchemaValidator } from '@/lib/validation';

// ── Zod-inferred types ────────────────────────────────────────────────────────

export type TrackingField  = z.infer<typeof TrackingFieldSchema>;
export type TrackingSchema = z.infer<typeof TrackingSchemaValidator>;

// ── Preset tracking schemas ───────────────────────────────────────────────────

/** Barbell / dumbbell lifts: weight + reps */
export const WEIGHT_REPS: TrackingSchema = {
  fields: [
    { key: 'weight', label: 'Weight', type: 'number', unit: 'kg',      optional: false },
    { key: 'reps',   label: 'Reps',   type: 'number',                  optional: false },
  ],
};

/** Bodyweight exercises with optional added load */
export const BODYWEIGHT_REPS: TrackingSchema = {
  fields: [
    { key: 'reps',         label: 'Reps',         type: 'number',              optional: false },
    { key: 'added_weight', label: 'Added Weight',  type: 'number', unit: 'kg', optional: true  },
  ],
};

/** Timed exercises (plank, hold, etc.) */
export const TIME: TrackingSchema = {
  fields: [
    { key: 'duration', label: 'Duration', type: 'number', unit: 'seconds', optional: false },
  ],
};

/** Distance-based cardio with optional time */
export const DISTANCE: TrackingSchema = {
  fields: [
    { key: 'distance', label: 'Distance', type: 'number', unit: 'metres',  optional: false },
    { key: 'duration', label: 'Time',     type: 'number', unit: 'seconds', optional: true  },
  ],
};

/** Weighted lap-based work like sled pushes or loaded carries */
export const WEIGHT_LAPS: TrackingSchema = {
  fields: [
    { key: 'weight', label: 'Weight', type: 'number', unit: 'kg', optional: false },
    { key: 'laps',   label: 'Laps',   type: 'number',             optional: false },
  ],
};

/** Lap-based swimming / circuit without a timer field */
export const LAPS: TrackingSchema = {
  fields: [
    { key: 'laps', label: 'Laps', type: 'number', optional: false },
  ],
};

export const TRACKING_PRESETS = {
  WEIGHT_REPS,
  BODYWEIGHT_REPS,
  TIME,
  DISTANCE,
  WEIGHT_LAPS,
  LAPS,
} as const;

export type TrackingPresetKey = keyof typeof TRACKING_PRESETS;

/** Human-readable labels for each preset (used in ExerciseCreator UI) */
export const TRACKING_PRESET_LABELS: Record<TrackingPresetKey, string> = {
  WEIGHT_REPS:     'Weight + Reps',
  BODYWEIGHT_REPS: 'Bodyweight + Reps',
  TIME:            'Time',
  DISTANCE:        'Distance',
  WEIGHT_LAPS:     'Weight + Laps',
  LAPS:            'Laps',
};
