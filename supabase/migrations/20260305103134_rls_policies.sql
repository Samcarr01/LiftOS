-- ── Enable RLS on every table ─────────────────────────────────────────────────
ALTER TABLE public.users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_exercises         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_exercises          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_summaries           ENABLE ROW LEVEL SECURITY;

-- ── Direct user_id tables ─────────────────────────────────────────────────────
CREATE POLICY "own_data" ON public.users
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "own_data" ON public.exercises
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON public.workout_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON public.workout_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON public.last_performance_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON public.personal_records
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON public.ai_suggestions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON public.weekly_summaries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Child tables: RLS via parent join ────────────────────────────────────────
CREATE POLICY "own_data" ON public.template_exercises
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_templates t
      WHERE t.id = template_exercises.template_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_templates t
      WHERE t.id = template_exercises.template_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "own_data" ON public.session_exercises
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_exercises.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_exercises.session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "own_data" ON public.set_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
      JOIN public.workout_sessions ws ON ws.id = se.session_id
      WHERE se.id = set_entries.session_exercise_id AND ws.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
      JOIN public.workout_sessions ws ON ws.id = se.session_id
      WHERE se.id = set_entries.session_exercise_id AND ws.user_id = auth.uid()
    )
  );
