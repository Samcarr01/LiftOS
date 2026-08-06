-- ── Fix Cycle 3: Migration Reconciliation ────────────────────────────────────
-- Adds columns that the app queries but no committed migration has created.
--
-- Gap analysis (committed migrations vs. app queries):
--   workout_sessions: missing template_name, is_light_session
--   users:            missing training_goals, experience_level, body_weight_kg,
--                     preferred_rep_range, onboarding_completed, avatar_url
--
-- Only additive changes — no ALTER COLUMN, no DROP, no retroactive edits.
-- Safe to apply to any environment that has run the previous 10 migrations.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. workout_sessions ────────────────────────────────────────────────────
-- The web app inserts template_name on session creation (use-start-workout.ts)
-- and displays it in the session detail, home, and history views.
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS template_name text;

-- The web app's home, history, session-detail, and API route all reference
-- is_light_session for filtering light sessions from XP/progression logic.
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS is_light_session boolean NOT NULL DEFAULT false;

-- ── 2. users ─────────────────────────────────────────────────────────────────
-- Training goals (e.g. ["strength", "hypertrophy"]) — used by the guided
-- progression engine (api/workouts/complete) and the onboarding/profile pages.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS training_goals text[] NOT NULL DEFAULT '{}';

-- User's self-reported experience level — used by the progression engine.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS experience_level text NOT NULL DEFAULT 'intermediate'
    CHECK (experience_level IN ('beginner', 'intermediate', 'advanced'));

-- Body weight in kg — used by the onboarding flow and profile/training page.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS body_weight_kg numeric;

-- User's preferred rep range (e.g. { min: 8, max: 12 }) — used by the
-- progression engine to tailor AI suggestions.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_rep_range jsonb;

-- Whether the user has completed onboarding — used by the Next.js middleware
-- to redirect new users to the onboarding flow.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Avatar URL — stored in the users table so the web home page can display
-- the user's avatar without an extra join to auth.users.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;