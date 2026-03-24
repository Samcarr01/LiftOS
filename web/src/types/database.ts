/**
 * Supabase database type definitions.
 * Mirrors the exact schema applied in migration 001.
 *
 * Insert/Update types are kept fully explicit (no self-referential Omit/Partial)
 * to avoid TypeScript circular-inference collapsing them to `never`.
 *
 * Each table includes `Relationships: []` to satisfy the `GenericTable` constraint
 * required by @supabase/postgrest-js >= v1.10.
 *
 * Re-generate with: `supabase gen types typescript --project-id <project-id>`
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      // ── users ───────────────────────────────────────────────────────────────
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          unit_preference: 'kg' | 'lb';
          subscription_tier: 'free' | 'pro';
          training_goals: string[];
          experience_level: 'beginner' | 'intermediate' | 'advanced';
          body_weight_kg: number | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          unit_preference?: 'kg' | 'lb';
          subscription_tier?: 'free' | 'pro';
          training_goals?: string[];
          experience_level?: 'beginner' | 'intermediate' | 'advanced';
          body_weight_kg?: number | null;
          onboarding_completed?: boolean;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          unit_preference?: 'kg' | 'lb';
          subscription_tier?: 'free' | 'pro';
          training_goals?: string[];
          experience_level?: 'beginner' | 'intermediate' | 'advanced';
          body_weight_kg?: number | null;
          onboarding_completed?: boolean;
        };
        Relationships: [];
      };

      // ── exercises ────────────────────────────────────────────────────────────
      exercises: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          muscle_groups: string[];
          tracking_schema: Json;
          unit_config: Json;
          default_rest_seconds: number;
          notes: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          muscle_groups?: string[];
          tracking_schema: Json;
          unit_config?: Json;
          default_rest_seconds?: number;
          notes?: string | null;
          is_archived?: boolean;
        };
        Update: {
          user_id?: string;
          name?: string;
          muscle_groups?: string[];
          tracking_schema?: Json;
          unit_config?: Json;
          default_rest_seconds?: number;
          notes?: string | null;
          is_archived?: boolean;
        };
        Relationships: [];
      };

      // ── workout_templates ───────────────────────────────────────────────────
      workout_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          is_pinned: boolean;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          is_pinned?: boolean;
          last_used_at?: string | null;
        };
        Update: {
          user_id?: string;
          name?: string;
          is_pinned?: boolean;
          last_used_at?: string | null;
        };
        Relationships: [];
      };

      // ── template_exercises ──────────────────────────────────────────────────
      template_exercises: {
        Row: {
          id: string;
          template_id: string;
          exercise_id: string;
          order_index: number;
          default_set_count: number;
          rest_seconds: number | null;
          superset_group_id: string | null;
          target_ranges: Json | null;
          notes: string | null;
        };
        Insert: {
          template_id: string;
          exercise_id: string;
          order_index: number;
          default_set_count?: number;
          rest_seconds?: number | null;
          superset_group_id?: string | null;
          target_ranges?: Json | null;
          notes?: string | null;
        };
        Update: {
          template_id?: string;
          exercise_id?: string;
          order_index?: number;
          default_set_count?: number;
          rest_seconds?: number | null;
          superset_group_id?: string | null;
          target_ranges?: Json | null;
          notes?: string | null;
        };
        Relationships: [];
      };

      // ── workout_sessions ────────────────────────────────────────────────────
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          template_id: string | null;
          template_name: string | null;
          started_at: string;
          completed_at: string | null;
          duration_seconds: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          template_id?: string | null;
          template_name?: string | null;
          started_at?: string;
          completed_at?: string | null;
          duration_seconds?: number | null;
          notes?: string | null;
        };
        Update: {
          user_id?: string;
          template_id?: string | null;
          template_name?: string | null;
          started_at?: string;
          completed_at?: string | null;
          duration_seconds?: number | null;
          notes?: string | null;
        };
        Relationships: [];
      };

      // ── session_exercises ───────────────────────────────────────────────────
      session_exercises: {
        Row: {
          id: string;
          session_id: string;
          exercise_id: string;
          order_index: number;
          rest_seconds: number | null;
          superset_group_id: string | null;
          notes: string | null;
        };
        Insert: {
          session_id: string;
          exercise_id: string;
          order_index: number;
          rest_seconds?: number | null;
          superset_group_id?: string | null;
          notes?: string | null;
        };
        Update: {
          session_id?: string;
          exercise_id?: string;
          order_index?: number;
          rest_seconds?: number | null;
          superset_group_id?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };

      // ── set_entries ─────────────────────────────────────────────────────────
      set_entries: {
        Row: {
          id: string;
          session_exercise_id: string;
          set_index: number;
          values: Json;
          set_type: 'warmup' | 'working' | 'top' | 'drop' | 'failure';
          is_completed: boolean;
          notes: string | null;
          logged_at: string;
        };
        Insert: {
          session_exercise_id: string;
          set_index: number;
          values: Json;
          set_type?: 'warmup' | 'working' | 'top' | 'drop' | 'failure';
          is_completed?: boolean;
          notes?: string | null;
        };
        Update: {
          session_exercise_id?: string;
          set_index?: number;
          values?: Json;
          set_type?: 'warmup' | 'working' | 'top' | 'drop' | 'failure';
          is_completed?: boolean;
          notes?: string | null;
        };
        Relationships: [];
      };

      // ── last_performance_snapshots ──────────────────────────────────────────
      last_performance_snapshots: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          session_id: string | null;
          sets_data: Json;
          performed_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          exercise_id: string;
          session_id?: string | null;
          sets_data: Json;
          performed_at: string;
        };
        Update: {
          user_id?: string;
          exercise_id?: string;
          session_id?: string | null;
          sets_data?: Json;
          performed_at?: string;
        };
        Relationships: [];
      };

      // ── personal_records ────────────────────────────────────────────────────
      personal_records: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          record_type: 'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
          record_value: number;
          record_context: Json | null;
          achieved_at: string;
          session_id: string | null;
        };
        Insert: {
          user_id: string;
          exercise_id: string;
          record_type: 'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
          record_value: number;
          record_context?: Json | null;
          achieved_at?: string;
          session_id?: string | null;
        };
        Update: {
          user_id?: string;
          exercise_id?: string;
          record_type?: 'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
          record_value?: number;
          record_context?: Json | null;
          achieved_at?: string;
          session_id?: string | null;
        };
        Relationships: [];
      };

      // ── ai_suggestions ──────────────────────────────────────────────────────
      ai_suggestions: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          suggestion_data: Json;
          history_snapshot: Json;
          model_version: string;
          created_at: string;
          expires_at: string | null;
        };
        Insert: {
          user_id: string;
          exercise_id: string;
          suggestion_data: Json;
          history_snapshot: Json;
          model_version: string;
          expires_at?: string | null;
        };
        Update: {
          user_id?: string;
          exercise_id?: string;
          suggestion_data?: Json;
          history_snapshot?: Json;
          model_version?: string;
          expires_at?: string | null;
        };
        Relationships: [];
      };

      // ── weekly_summaries ────────────────────────────────────────────────────
      weekly_summaries: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          summary_data: Json;
          created_at: string;
        };
        Insert: {
          user_id: string;
          week_start: string;
          summary_data: Json;
        };
        Update: {
          user_id?: string;
          week_start?: string;
          summary_data?: Json;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ── Convenience row-type aliases ──────────────────────────────────────────────
type Tables = Database['public']['Tables'];

export type UserRow                    = Tables['users']['Row'];
export type ExerciseRow                = Tables['exercises']['Row'];
export type WorkoutTemplateRow         = Tables['workout_templates']['Row'];
export type TemplateExerciseRow        = Tables['template_exercises']['Row'];
export type WorkoutSessionRow          = Tables['workout_sessions']['Row'];
export type SessionExerciseRow         = Tables['session_exercises']['Row'];
export type SetEntryRow                = Tables['set_entries']['Row'];
export type LastPerformanceSnapshotRow = Tables['last_performance_snapshots']['Row'];
export type PersonalRecordRow          = Tables['personal_records']['Row'];
export type AISuggestionRow            = Tables['ai_suggestions']['Row'];
export type WeeklySummaryRow           = Tables['weekly_summaries']['Row'];
