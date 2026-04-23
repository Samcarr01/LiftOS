/**
 * App-layer types.
 *
 * Design rules:
 *  - jsonb-backed types always use z.infer<> so validation is the source of truth
 *  - DB row types are extended (not replaced) when we need richer app shapes
 *  - SetEntry adds `isPendingSync` for offline-first writes
 */

import type { z } from 'zod';
import type {
  AISuggestionDataSchema,
  ExerciseCreateSchema,
  ExerciseUpdateSchema,
  TemplateCreateSchema,
  TemplateExerciseCreateSchema,
  WeeklySummaryDataSchema,
  DetectPlateauResponseSchema,
  SetTypeSchema,
  LastPerformanceSetSchema,
} from '@/lib/validation';
import type {
  WorkoutSessionRow,
  SessionExerciseRow,
  ExerciseRow,
} from './database';
import type { TrackingSchema } from './tracking';

// ── Primitive types ───────────────────────────────────────────────────────────

export type UnitPreference    = 'kg' | 'lb';
export type SubscriptionTier  = 'free' | 'pro';
export type SetType           = z.infer<typeof SetTypeSchema>;
export type SetValues         = Record<string, number | string>;

// ── Zod-inferred complex types ────────────────────────────────────────────────

export type AISuggestionData          = z.infer<typeof AISuggestionDataSchema>;
export type ExerciseCreate            = z.infer<typeof ExerciseCreateSchema>;
export type ExerciseUpdate            = z.infer<typeof ExerciseUpdateSchema>;
export type TemplateCreate            = z.infer<typeof TemplateCreateSchema>;
export type TemplateExerciseCreate    = z.infer<typeof TemplateExerciseCreateSchema>;
export type WeeklySummaryData         = z.infer<typeof WeeklySummaryDataSchema>;
export type DetectPlateauResponse     = z.infer<typeof DetectPlateauResponseSchema>;
export type LastPerformanceSet        = z.infer<typeof LastPerformanceSetSchema>;

// ── Exercise with parsed tracking_schema ──────────────────────────────────────

/** Exercise row with jsonb tracking_schema parsed to a typed TrackingSchema */
export interface ExerciseWithSchema extends Omit<ExerciseRow, 'tracking_schema'> {
  tracking_schema: TrackingSchema;
}

// ── Set entry (app layer) ─────────────────────────────────────────────────────

/** App-layer SetEntry: jsonb `values` typed, plus offline sync flag */
export interface SetEntry {
  id:                   string;
  sessionExerciseId:    string;
  setIndex:             number;
  values:               SetValues;
  setType:              SetType;
  isCompleted:          boolean;
  notes:                string | null;
  loggedAt:             string;
  /** Present when created offline and not yet flushed to Supabase */
  isPendingSync?:       boolean;
}

/** Pre-filled set values cloned from last_performance_snapshots */
export interface PrefilledSet {
  setIndex:  number;
  values:    SetValues;
  setType:   SetType;
}

// ── Active workout state ──────────────────────────────────────────────────────

export interface RestTimer {
  isRunning:  boolean;
  remaining:  number; // seconds remaining
}

export interface ActiveExerciseState {
  sessionExercise:     SessionExerciseRow;
  exercise:            ExerciseWithSchema;
  sets:                SetEntry[];
  lastPerformanceSets: SetValues[] | null;
  aiSuggestion:        AISuggestionData | null;
  restTimer:           RestTimer;
}

export interface ActiveWorkoutState {
  session:        WorkoutSessionRow;
  exercises:      ActiveExerciseState[];
  elapsedTimer:   number;  // seconds elapsed since session.started_at
  isCompleting:   boolean;
  isLightSession: boolean; // user-tagged "light / off day" — excluded from prefill + AI trend
}

// ── start-workout Edge Function I/O ──────────────────────────────────────────

export interface StartWorkoutPayload {
  templateId: string | null;
}

export interface StartWorkoutExercise {
  sessionExercise: SessionExerciseRow;
  exercise:        ExerciseWithSchema;
  lastPerformance: LastPerformanceSet[] | null;
  aiSuggestion:    AISuggestionData | null;
  prefilledSets:   PrefilledSet[];
}

export interface StartWorkoutResponse {
  session:   WorkoutSessionRow;
  exercises: StartWorkoutExercise[];
}

// ── complete-workout Edge Function I/O ───────────────────────────────────────

export interface CompleteWorkoutPayload {
  sessionId: string;
}

// ── History types ─────────────────────────────────────────────────────────────

export interface HistorySessionSummary {
  id:               string;
  started_at:       string;
  completed_at:     string | null;
  duration_seconds: number | null;
  template_name:    string | null;
  exercise_count:   number;
  total_sets:       number;
  volume_kg:        number;
  primary_exercise_name: string | null;
  primary_result:        string | null;
  is_light_session: boolean;
}

export interface SessionDetailSet {
  id:           string;
  set_index:    number;
  values:       SetValues;
  set_type:     SetType;
  is_completed: boolean;
  notes:        string | null;
  logged_at:    string;
}

export interface PersonalRecordSummary {
  exercise_id:  string;
  record_type:  'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
  record_value: number;
}

export interface SessionDetailExercise {
  session_exercise_id: string;
  exercise_id:         string;
  exercise_name:       string;
  muscle_groups:       string[];
  order_index:         number;
  superset_group_id:   string | null;
  tracking_schema:     TrackingSchema;
  notes:               string | null;
  sets:                SessionDetailSet[];
  prs:                 PersonalRecordSummary[];
}

export interface SessionDetail {
  id:               string;
  started_at:       string;
  completed_at:     string | null;
  duration_seconds: number | null;
  template_name:    string | null;
  notes:            string | null;
  exercises:        SessionDetailExercise[];
  total_volume_kg:  number;
  total_sets:       number;
  is_light_session: boolean;
}

export interface CompleteWorkoutExerciseSuggestion {
  exercise_id: string;
  exercise_name: string;
  suggestion: AISuggestionData | null;
}

export interface CompleteWorkoutResponse {
  sessionId: string;
  summary: {
    exercise_count: number;
    total_sets: number;
    total_volume_kg: number;
    duration_seconds: number;
  };
  newPrs: Array<{
    exercise_id: string;
    exercise_name: string;
    record_type: 'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
    record_value: number;
  }>;
  exerciseNames: string[];
  suggestions: CompleteWorkoutExerciseSuggestion[];
}

// ── Offline sync ──────────────────────────────────────────────────────────────

export interface OfflineMutation {
  table:     'set_entries' | 'workout_sessions' | 'session_exercises';
  operation: 'insert' | 'update' | 'delete';
  data:      Record<string, unknown>;
  clientId:  string;
  timestamp: string;
}
