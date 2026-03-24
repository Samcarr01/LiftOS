/**
 * Zod schemas — single source of truth for runtime validation.
 *
 * Rules:
 *  - All jsonb columns validated here before insert/update
 *  - TypeScript types are derived via z.infer<> (see src/types/tracking.ts and app.ts)
 *  - Edge Function responses validated with the same schemas
 */

import { z } from 'zod';

// ── Tracking schema ───────────────────────────────────────────────────────────

export const TrackingFieldSchema = z.object({
  key:      z.string().min(1).max(50),
  label:    z.string().min(1).max(100),
  type:     z.enum(['number', 'text']),
  unit:     z.string().max(20).optional(),
  optional: z.boolean().optional().default(false),
});

export const TrackingSchemaValidator = z.object({
  fields: z.array(TrackingFieldSchema).min(1).max(10),
});

/**
 * Build a Zod schema for set `values` at runtime from the exercise tracking_schema.
 * Call once per exercise, cache the result.
 */
export function buildSetValuesSchema(
  trackingSchema: z.infer<typeof TrackingSchemaValidator>,
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of trackingSchema.fields) {
    const base: z.ZodTypeAny =
      field.type === 'number'
        ? z.number({ error: `${field.label} must be a number` })
        : z.string({ error: `${field.label} must be text` }).min(1);
    shape[field.key] = field.optional ? base.optional() : base;
  }
  return z.object(shape);
}

// ── AI suggestion ─────────────────────────────────────────────────────────────

const SuggestionValuesSchema = z.object({
  weight:       z.number().positive().optional(),
  added_weight: z.number().positive().optional(),
  reps:         z.number().int().positive().optional(),
  laps:         z.number().int().positive().optional(),
  duration:     z.number().positive().optional(),
  distance:     z.number().positive().optional(),
  height:       z.number().positive().optional(),
});

const SuggestionResultSchema = z.object({
  display: z.string().min(1).max(200),
  values:  SuggestionValuesSchema,
});

export const AISuggestionDataSchema = z.object({
  decision: z.enum(['hold', 'progress', 'deload']),
  metric: z.enum(['weight', 'added_weight', 'reps', 'laps', 'duration', 'distance', 'height'])
    .nullable()
    .optional(),
  last_result: SuggestionResultSchema.nullable(),
  next_target: SuggestionResultSchema.nullable(),
  reason: z.string().max(500),
  progression: z.object({
    eligible: z.boolean(),
    separate_win_count: z.number().int().min(0),
    wins_required: z.number().int().min(1),
    last_progression_date: z.string().nullable(),
    rep_range: z.object({ min: z.number(), max: z.number() }).optional(),
    set_breakdown: z.string().optional(),
    exercise_category: z.string().optional(),
    trend: z.string().optional(),
    sessions_at_weight: z.number().int().optional(),
  }),
});

// ── Exercises ─────────────────────────────────────────────────────────────────

export const ExerciseCreateSchema = z.object({
  name:                 z.string().min(1).max(100).trim(),
  muscle_groups:        z.array(z.string().min(1).max(50)).max(10).default([]),
  tracking_schema:      TrackingSchemaValidator,
  unit_config:          z.record(z.string(), z.string()).default({}),
  default_rest_seconds: z.number().int().min(0).max(600).default(90),
  notes:                z.string().max(500).nullable().optional(),
});

export const ExerciseUpdateSchema = ExerciseCreateSchema.partial().extend({
  is_archived: z.boolean().optional(),
});

// ── Templates ─────────────────────────────────────────────────────────────────

export const TemplateCreateSchema = z.object({
  name:      z.string().min(1).max(100).trim(),
  is_pinned: z.boolean().default(false),
});

export const TargetRangeSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export const TemplateExerciseCreateSchema = z.object({
  exercise_id:       z.string().uuid(),
  order_index:       z.number().int().min(0),
  default_set_count: z.number().int().min(1).max(20).default(3),
  rest_seconds:      z.number().int().min(0).max(600).nullable().optional(),
  superset_group_id: z.string().max(50).nullable().optional(),
  target_ranges:     z.record(z.string(), TargetRangeSchema).nullable().optional(),
  notes:             z.string().max(500).nullable().optional(),
});

// ── Workout sessions ──────────────────────────────────────────────────────────

export const StartWorkoutPayloadSchema = z.object({
  template_id: z.string().uuid().nullable(),
});

// ── Set entries ───────────────────────────────────────────────────────────────

export const SetTypeSchema = z.enum(['warmup', 'working', 'top', 'drop', 'failure']);

// ── Last performance snapshot sets_data ───────────────────────────────────────

export const LastPerformanceSetSchema = z.object({
  set_index: z.number().int().min(0),
  values:    z.record(z.string(), z.union([z.number(), z.string()])),
  set_type:  SetTypeSchema,
});

export const LastPerformanceSetsDataSchema = z.array(LastPerformanceSetSchema);

// ── Weekly summary data ───────────────────────────────────────────────────────

export const WeeklySummaryDataSchema = z.object({
  workouts_completed:    z.number().int().min(0),
  total_volume_kg:       z.number().min(0),
  total_sets:            z.number().int().min(0),
  strongest_lift:        z.object({ exercise: z.string(), value: z.string() }).nullable(),
  most_improved_group:   z.string().nullable(),
  muscle_volume:         z.record(z.string(), z.number()).optional(),
  insight:               z.string().max(500).nullable(),
});

// ── Offline sync queue ────────────────────────────────────────────────────────

export const OfflineMutationSchema = z.object({
  table:     z.enum(['set_entries', 'workout_sessions', 'session_exercises']),
  operation: z.enum(['insert', 'update', 'delete']),
  data:      z.record(z.string(), z.unknown()),
  client_id: z.string().min(1),    // idempotency key
  timestamp: z.string().min(1),
});

export const OfflineSyncPayloadSchema = z.object({
  mutations: z.array(OfflineMutationSchema).min(1).max(100),
});

// ── Plateau detection response ────────────────────────────────────────────────

export const DetectPlateauResponseSchema = z.object({
  is_plateau:       z.boolean(),
  sessions_stalled: z.number().int().min(0),
  suggestion:       z.string().max(300),
});
