/**
 * Type barrel — import everything from here.
 *
 * import type { SetEntry, ActiveWorkoutState, TrackingSchema } from '@/types';
 */

// ── Database row types & Supabase generic ─────────────────────────────────────
export type {
  Json,
  Database,
  UserRow,
  ExerciseRow,
  WorkoutTemplateRow,
  TemplateExerciseRow,
  WorkoutSessionRow,
  SessionExerciseRow,
  SetEntryRow,
  LastPerformanceSnapshotRow,
  PersonalRecordRow,
  AISuggestionRow,
  WeeklySummaryRow,
} from './database';

// ── Tracking schema types & preset constants ──────────────────────────────────
export type {
  TrackingField,
  TrackingSchema,
  TrackingPresetKey,
} from './tracking';

export {
  WEIGHT_REPS,
  BODYWEIGHT_REPS,
  TIME,
  DISTANCE,
  LAPS,
  TRACKING_PRESETS,
  TRACKING_PRESET_LABELS,
} from './tracking';

// ── App-layer types ───────────────────────────────────────────────────────────
export type {
  // Primitives
  UnitPreference,
  SubscriptionTier,
  SetType,
  SetValues,
  // Zod-derived
  AISuggestionData,
  ExerciseCreate,
  ExerciseUpdate,
  TemplateCreate,
  TemplateExerciseCreate,
  WeeklySummaryData,
  DetectPlateauResponse,
  LastPerformanceSet,
  // Entities
  ExerciseWithSchema,
  SetEntry,
  PrefilledSet,
  // Active workout
  RestTimer,
  ActiveExerciseState,
  ActiveWorkoutState,
  // Legacy (workout-store.ts compat until prompt 007/008)
  ActiveSessionExercise,
  ActiveWorkout,
  // Edge function I/O
  StartWorkoutPayload,
  StartWorkoutExercise,
  StartWorkoutResponse,
  CompleteWorkoutPayload,
  OfflineMutation,
} from './app';
