-- ── Seed function: inserts ~20 default exercises for a new user ───────────────
CREATE OR REPLACE FUNCTION public.seed_default_exercises(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.exercises
    (user_id, name, muscle_groups, tracking_schema, unit_config, default_rest_seconds)
  VALUES
    (p_user_id, 'Bench Press',
      ARRAY['chest','shoulders','triceps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 120),

    (p_user_id, 'Squat',
      ARRAY['quadriceps','glutes','hamstrings'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 180),

    (p_user_id, 'Deadlift',
      ARRAY['hamstrings','glutes','lower back'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 180),

    (p_user_id, 'Overhead Press',
      ARRAY['shoulders','triceps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 120),

    (p_user_id, 'Barbell Row',
      ARRAY['back','biceps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 120),

    (p_user_id, 'Romanian Deadlift',
      ARRAY['hamstrings','glutes'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 120),

    (p_user_id, 'Pull-Up',
      ARRAY['back','biceps'],
      '{"fields":[{"key":"reps","label":"Reps","type":"number"},{"key":"added_weight","label":"Added Weight","type":"number","unit":"kg","optional":true}]}'::jsonb,
      '{}'::jsonb, 120),

    (p_user_id, 'Chin-Up',
      ARRAY['back','biceps'],
      '{"fields":[{"key":"reps","label":"Reps","type":"number"},{"key":"added_weight","label":"Added Weight","type":"number","unit":"kg","optional":true}]}'::jsonb,
      '{}'::jsonb, 120),

    (p_user_id, 'Dip',
      ARRAY['chest','triceps','shoulders'],
      '{"fields":[{"key":"reps","label":"Reps","type":"number"},{"key":"added_weight","label":"Added Weight","type":"number","unit":"kg","optional":true}]}'::jsonb,
      '{}'::jsonb, 90),

    (p_user_id, 'Lat Pulldown',
      ARRAY['back','biceps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 90),

    (p_user_id, 'Cable Row',
      ARRAY['back','biceps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 90),

    (p_user_id, 'Leg Press',
      ARRAY['quadriceps','glutes'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 120),

    (p_user_id, 'Leg Curl',
      ARRAY['hamstrings'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 60),

    (p_user_id, 'Lateral Raise',
      ARRAY['shoulders'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 60),

    (p_user_id, 'Face Pull',
      ARRAY['shoulders','rear delts','traps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 60),

    (p_user_id, 'Bicep Curl',
      ARRAY['biceps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 60),

    (p_user_id, 'Tricep Extension',
      ARRAY['triceps'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 60),

    (p_user_id, 'Leg Curl',
      ARRAY['hamstrings'],
      '{"fields":[{"key":"weight","label":"Weight","type":"number","unit":"kg"},{"key":"reps","label":"Reps","type":"number"}]}'::jsonb,
      '{"weight":"kg"}'::jsonb, 60),

    (p_user_id, 'Plank',
      ARRAY['core','shoulders'],
      '{"fields":[{"key":"duration","label":"Duration","type":"number","unit":"seconds"}]}'::jsonb,
      '{}'::jsonb, 60),

    (p_user_id, 'Running',
      ARRAY['legs','cardio'],
      '{"fields":[{"key":"distance","label":"Distance","type":"number","unit":"metres"},{"key":"duration","label":"Time","type":"number","unit":"seconds","optional":true}]}'::jsonb,
      '{}'::jsonb, 0),

    (p_user_id, 'Cycling',
      ARRAY['legs','cardio'],
      '{"fields":[{"key":"distance","label":"Distance","type":"number","unit":"metres"},{"key":"duration","label":"Time","type":"number","unit":"seconds","optional":true}]}'::jsonb,
      '{}'::jsonb, 0);
END;
$$;

-- ── Auth trigger: create public.users row + seed exercises on signup ──────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    )
  );

  PERFORM public.seed_default_exercises(NEW.id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
