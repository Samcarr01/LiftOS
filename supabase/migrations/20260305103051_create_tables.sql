-- ── updated_at helper (applied to all tables that have that column) ──────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 1. users ─────────────────────────────────────────────────────────────────
CREATE TABLE public.users (
  id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              text        NOT NULL,
  display_name       text,
  unit_preference    text        NOT NULL DEFAULT 'kg'   CHECK (unit_preference   IN ('kg','lb')),
  subscription_tier  text        NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free','pro')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. exercises ─────────────────────────────────────────────────────────────
CREATE TABLE public.exercises (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  muscle_groups         text[]      NOT NULL DEFAULT '{}',
  tracking_schema       jsonb       NOT NULL,
  unit_config           jsonb       NOT NULL DEFAULT '{}',
  default_rest_seconds  int         NOT NULL DEFAULT 90,
  notes                 text,
  is_archived           boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_exercises_updated_at
  BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. workout_templates ──────────────────────────────────────────────────────
CREATE TABLE public.workout_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  is_pinned    boolean     NOT NULL DEFAULT false,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_workout_templates_updated_at
  BEFORE UPDATE ON public.workout_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. template_exercises ────────────────────────────────────────────────────
CREATE TABLE public.template_exercises (
  id                uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid  NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_id       uuid  NOT NULL REFERENCES public.exercises(id)          ON DELETE RESTRICT,
  order_index       int   NOT NULL,
  default_set_count int   NOT NULL DEFAULT 3,
  rest_seconds      int,
  superset_group_id text,
  target_ranges     jsonb,
  notes             text,
  UNIQUE (template_id, order_index)
);

-- ── 5. workout_sessions ──────────────────────────────────────────────────────
CREATE TABLE public.workout_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.users(id)             ON DELETE CASCADE,
  template_id      uuid                 REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  duration_seconds int,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 6. session_exercises ─────────────────────────────────────────────────────
CREATE TABLE public.session_exercises (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id       uuid NOT NULL REFERENCES public.exercises(id)         ON DELETE RESTRICT,
  order_index       int  NOT NULL,
  rest_seconds      int,
  superset_group_id text,
  notes             text
);

-- ── 7. set_entries ───────────────────────────────────────────────────────────
CREATE TABLE public.set_entries (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id   uuid        NOT NULL REFERENCES public.session_exercises(id) ON DELETE CASCADE,
  set_index             int         NOT NULL,
  values                jsonb       NOT NULL,
  set_type              text        NOT NULL DEFAULT 'working'
                                    CHECK (set_type IN ('warmup','working','top','drop','failure')),
  is_completed          boolean     NOT NULL DEFAULT false,
  notes                 text,
  logged_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_exercise_id, set_index)
);

-- ── 8. last_performance_snapshots ────────────────────────────────────────────
CREATE TABLE public.last_performance_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  exercise_id  uuid        NOT NULL REFERENCES public.exercises(id)        ON DELETE CASCADE,
  session_id   uuid                 REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
  sets_data    jsonb       NOT NULL,
  performed_at timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_id)
);
CREATE TRIGGER trg_last_perf_updated_at
  BEFORE UPDATE ON public.last_performance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 9. personal_records ──────────────────────────────────────────────────────
CREATE TABLE public.personal_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  exercise_id    uuid        NOT NULL REFERENCES public.exercises(id)        ON DELETE CASCADE,
  record_type    text        NOT NULL
                             CHECK (record_type IN ('best_weight','best_reps_at_weight','best_e1rm','best_volume')),
  record_value   numeric     NOT NULL,
  record_context jsonb,
  achieved_at    timestamptz NOT NULL,
  session_id     uuid                 REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
  UNIQUE (user_id, exercise_id, record_type)
);

-- ── 10. ai_suggestions ───────────────────────────────────────────────────────
CREATE TABLE public.ai_suggestions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  exercise_id      uuid        NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  suggestion_data  jsonb       NOT NULL,
  history_snapshot jsonb       NOT NULL,
  model_version    text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz
);

-- ── 11. weekly_summaries ─────────────────────────────────────────────────────
CREATE TABLE public.weekly_summaries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start   date        NOT NULL,
  summary_data jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);
