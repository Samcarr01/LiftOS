ALTER TABLE public.users
  ADD COLUMN weekly_workout_target smallint NOT NULL DEFAULT 4
    CHECK (weekly_workout_target BETWEEN 1 AND 7);
