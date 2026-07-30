-- Update the experience_level CHECK constraint to allow all 7 training-stage values.
-- The old constraint only allowed 'beginner', 'intermediate', 'advanced'.
-- The new values cover the full progression: just-starting, novice, early-intermediate,
-- intermediate, advanced-intermediate, advanced, elite.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_experience_level,
  ADD CONSTRAINT chk_experience_level
    CHECK (experience_level IN (
      'just-starting',
      'novice',
      'early-intermediate',
      'intermediate',
      'advanced-intermediate',
      'advanced',
      'elite'
    ));