-- Add unique constraint on (session_id, exercise_id, order_index) so the
-- sync-offline-queue Edge Function can use upsert with onConflict.
-- The offline queue layers already reference this constraint in their
-- upsert calls; the database constraint was missing.
ALTER TABLE public.session_exercises
  ADD CONSTRAINT session_exercises_session_exercise_order_key
  UNIQUE (session_id, exercise_id, order_index);