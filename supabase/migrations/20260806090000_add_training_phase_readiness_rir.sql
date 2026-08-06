-- ── Cut-Aware Progression v1 — training phase, readiness, RIR ────────────────
--
-- DEPLOYMENT GATE — APPLY AND VERIFY THIS MIGRATION BEFORE DEPLOYING ANY
-- APPLICATION CODE THAT WRITES OR READS training_phase,
-- training_phase_started_at, readiness, phase_at_session OR rir.
-- The completion route selects users.training_phase and writes readiness /
-- phase_at_session on every finished workout, and the set upsert always
-- carries a rir key. Against a database where this file has not yet run,
-- each of those becomes a hard PostgREST column error, so a lifter cannot
-- finish a workout at all. Apply the file, confirm all five columns and all
-- four named CHECK constraints exist, and only then deploy.
--
-- Adds the context columns the progression engine reads. Strictly additive:
-- no existing row is rewritten, no existing policy is touched, and every
-- statement is safe to re-run (house style, commit a606cdd).
--
--   users.training_phase             build | maintain | cut, defaulted to build
--   users.training_phase_started_at  when the current phase began (nullable)
--   workout_sessions.readiness       high | normal | low | very_low (nullable —
--                                    NULL means "never asked", not "bad day")
--   workout_sessions.phase_at_session  the phase in force when logged (nullable —
--                                    history is never retro-labelled)
--   set_entries.rir                  reps in reserve, 0…3 where 3 means "3+"
--
-- Named CHECK constraints are dropped before being re-added so a second run of
-- this file cannot fail on an already-present constraint.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. users: the current training phase ─────────────────────────────────────
-- Defaulted so every existing row reads as `build` — the pre-Cycle-2 behaviour.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS training_phase text NOT NULL DEFAULT 'build';

-- Nullable: an account that has never chosen a phase has no start date to show.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS training_phase_started_at timestamptz;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS chk_training_phase;

ALTER TABLE public.users
  ADD CONSTRAINT chk_training_phase CHECK (training_phase IN ('build', 'maintain', 'cut'));

-- ── 2. workout_sessions: optional per-session context ────────────────────────
-- Readiness is optional context and must never block a completion, so the
-- column stays nullable with no default.
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS readiness text;

ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS chk_session_readiness;

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT chk_session_readiness CHECK (readiness IS NULL OR readiness IN ('high', 'normal', 'low', 'very_low'));

-- The phase snapshot. No default: sessions logged before this migration carry
-- no phase, and guessing one would misreport a lifter's history.
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS phase_at_session text;

ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS chk_session_phase;

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT chk_session_phase CHECK (phase_at_session IS NULL OR phase_at_session IN ('build', 'maintain', 'cut'));

-- ── 3. set_entries: reps in reserve ──────────────────────────────────────────
-- Nullable with no default — an absent RIR is not RIR 0.
ALTER TABLE public.set_entries
  ADD COLUMN IF NOT EXISTS rir smallint;

ALTER TABLE public.set_entries
  DROP CONSTRAINT IF EXISTS chk_set_rir;

ALTER TABLE public.set_entries
  ADD CONSTRAINT chk_set_rir CHECK (rir IS NULL OR rir BETWEEN 0 AND 3);
