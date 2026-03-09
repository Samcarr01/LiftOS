CREATE INDEX idx_exercises_user
  ON public.exercises (user_id, is_archived);

CREATE INDEX idx_templates_user_pinned
  ON public.workout_templates (user_id, is_pinned, last_used_at DESC NULLS LAST);

CREATE INDEX idx_sessions_user_date
  ON public.workout_sessions (user_id, started_at DESC);

CREATE INDEX idx_sessions_template
  ON public.workout_sessions (user_id, template_id, started_at DESC);

CREATE INDEX idx_sets_session_exercise
  ON public.set_entries (session_exercise_id, set_index);

CREATE INDEX idx_last_perf_user_exercise
  ON public.last_performance_snapshots (user_id, exercise_id);

CREATE INDEX idx_ai_suggestions_exercise
  ON public.ai_suggestions (user_id, exercise_id, expires_at DESC NULLS LAST);

CREATE INDEX idx_personal_records_user_exercise
  ON public.personal_records (user_id, exercise_id, record_type);
