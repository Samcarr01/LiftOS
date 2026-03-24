import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { SetTypeSchema, TrackingSchemaValidator, AISuggestionDataSchema } from '@/lib/validation';
import {
  buildGuidedSuggestion,
  parsePreviousProgressionHistory,
  type ProgressHistorySession,
} from '@/lib/workout/guided-progression';
import {
  computeVolumeKg,
} from '@/lib/workout/formatting';
import type {
  CompleteWorkoutResponse,
  ExerciseWithSchema,
  SetType,
  SetValues,
  UnitPreference,
} from '@/types/app';
import type { Json } from '@/types/database';

const SetPayloadSchema = z.object({
  setIndex: z.number().int().min(0),
  values: z.record(z.string(), z.union([z.number(), z.string()])),
  setType: SetTypeSchema,
  isCompleted: z.boolean(),
  notes: z.string().nullable().optional(),
  loggedAt: z.string().nullable().optional(),
});

const CompleteWorkoutRequestSchema = z.object({
  sessionId: z.string().uuid(),
  exercises: z.array(z.object({
    sessionExerciseId: z.string().uuid(),
    sets: z.array(SetPayloadSchema).max(100),
  })).max(100),
});

type PersonalRecordType =
  | 'best_weight'
  | 'best_reps_at_weight'
  | 'best_e1rm'
  | 'best_volume';

interface SessionExerciseContext {
  id: string;
  session_id: string;
  exercise_id: string;
  order_index: number;
  notes: string | null;
  rest_seconds: number | null;
  exercise: ExerciseWithSchema;
  sets: Array<{
    id: string;
    set_index: number;
    values: SetValues;
    set_type: SetType;
    is_completed: boolean;
    notes: string | null;
    logged_at: string;
  }>;
}

interface ExistingPrRow {
  exercise_id: string;
  record_type: PersonalRecordType;
  record_value: number;
}

function epley(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

function getProgressionSets(sets: Array<{ values: SetValues; set_type: SetType; is_completed: boolean }>) {
  const completedSets = sets.filter((set) => set.is_completed);
  const workingSets = completedSets.filter((set) => set.set_type === 'working' || set.set_type === 'top');
  return workingSets.length > 0 ? workingSets : completedSets;
}

function buildSummary(
  sessionStartedAt: string,
  exercises: SessionExerciseContext[],
  finishedAt: string,
) {
  const totalSets = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.is_completed).length,
    0,
  );

  const totalVolumeKg = exercises.reduce((total, exercise) => (
    total + exercise.sets
      .filter((set) => set.is_completed)
      .reduce((exerciseTotal, set) => exerciseTotal + computeVolumeKg(set.values), 0)
  ), 0);

  const durationSeconds = Math.max(
    0,
    Math.floor((new Date(finishedAt).getTime() - new Date(sessionStartedAt).getTime()) / 1000),
  );

  return {
    exercise_count: exercises.length,
    total_sets: totalSets,
    total_volume_kg: +totalVolumeKg.toFixed(1),
    duration_seconds: durationSeconds,
  };
}

function buildSnapshotRows(
  exercises: SessionExerciseContext[],
  userId: string,
  sessionId: string,
  performedAt: string,
) {
  return exercises.flatMap((exercise) => {
    const completedSets = exercise.sets.filter((set) => set.is_completed);
    if (completedSets.length === 0) return [];

    return [{
      user_id: userId,
      exercise_id: exercise.exercise_id,
      session_id: sessionId,
      sets_data: completedSets.map((set) => ({
        set_index: set.set_index,
        values: set.values,
        set_type: set.set_type,
      })),
      performed_at: performedAt,
    }];
  });
}

function detectPersonalRecords(
  exercises: SessionExerciseContext[],
  existingRows: ExistingPrRow[],
  userId: string,
  sessionId: string,
  achievedAt: string,
) {
  const existingByExercise = new Map<string, Map<PersonalRecordType, number>>();

  for (const row of existingRows) {
    if (!existingByExercise.has(row.exercise_id)) {
      existingByExercise.set(row.exercise_id, new Map());
    }
    existingByExercise.get(row.exercise_id)!.set(row.record_type, Number(row.record_value));
  }

  const newPrs: CompleteWorkoutResponse['newPrs'] = [];
  const rows: Array<{
    user_id: string;
    exercise_id: string;
    record_type: PersonalRecordType;
    record_value: number;
    achieved_at: string;
    session_id: string;
  }> = [];

  for (const exercise of exercises) {
    const progressionSets = getProgressionSets(exercise.sets);
    const weightedSets = progressionSets.filter((set) => {
      const weight = typeof set.values.weight === 'number' ? set.values.weight : 0;
      const reps = typeof set.values.reps === 'number' ? set.values.reps : 0;
      return weight > 0 && reps > 0;
    });

    if (weightedSets.length === 0) continue;

    const existing = existingByExercise.get(exercise.exercise_id) ?? new Map<PersonalRecordType, number>();
    const maxWeight = Math.max(...weightedSets.map((set) => Number(set.values.weight ?? 0)));
    const repsAtWeight = Math.max(
      ...weightedSets
        .filter((set) => Number(set.values.weight ?? 0) === maxWeight)
        .map((set) => Number(set.values.reps ?? 0)),
    );
    const maxE1rm = Math.max(...weightedSets.map((set) =>
      epley(Number(set.values.weight ?? 0), Number(set.values.reps ?? 0)),
    ));
    const volume = weightedSets.reduce((total, set) => total + computeVolumeKg(set.values), 0);

    const candidates: Array<[PersonalRecordType, number]> = [
      ['best_weight', maxWeight],
      ['best_reps_at_weight', repsAtWeight],
      ['best_e1rm', +maxE1rm.toFixed(2)],
      ['best_volume', +volume.toFixed(1)],
    ];

    for (const [recordType, recordValue] of candidates) {
      const currentBest = existing.get(recordType) ?? 0;
      if (recordValue <= currentBest) continue;

      newPrs.push({
        exercise_id: exercise.exercise_id,
        exercise_name: exercise.exercise.name,
        record_type: recordType,
        record_value: recordValue,
      });

      rows.push({
        user_id: userId,
        exercise_id: exercise.exercise_id,
        record_type: recordType,
        record_value: recordValue,
        achieved_at: achievedAt,
        session_id: sessionId,
      });
    }
  }

  return { newPrs, rows };
}

async function loadSessionContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<SessionExerciseContext[]> {
  const { data: sessionExercises, error: sessionExercisesError } = await supabase
    .from('session_exercises')
    .select(`
      id,
      session_id,
      exercise_id,
      order_index,
      notes,
      rest_seconds,
      exercises (
        id,
        user_id,
        name,
        muscle_groups,
        tracking_schema,
        unit_config,
        default_rest_seconds,
        notes,
        is_archived,
        created_at,
        updated_at
      )
    `)
    .eq('session_id', sessionId)
    .order('order_index', { ascending: true });

  if (sessionExercisesError) throw sessionExercisesError;

  const sessionExerciseRows = (sessionExercises ?? []) as Array<{
    id: string;
    session_id: string;
    exercise_id: string;
    order_index: number;
    notes: string | null;
    rest_seconds: number | null;
    exercises: Json;
  }>;

  const sessionExerciseIds = sessionExerciseRows.map((row) => row.id);
  const { data: setEntries, error: setEntriesError } = sessionExerciseIds.length > 0
    ? await supabase
        .from('set_entries')
        .select('id, session_exercise_id, set_index, values, set_type, is_completed, notes, logged_at')
        .in('session_exercise_id', sessionExerciseIds)
        .order('set_index', { ascending: true })
    : { data: [], error: null };

  if (setEntriesError) throw setEntriesError;

  const setsBySessionExercise = new Map<string, SessionExerciseContext['sets']>();
  for (const row of (setEntries ?? []) as Array<{
    id: string;
    session_exercise_id: string;
    set_index: number;
    values: Json;
    set_type: SetType;
    is_completed: boolean;
    notes: string | null;
    logged_at: string;
  }>) {
    const existing = setsBySessionExercise.get(row.session_exercise_id) ?? [];
    existing.push({
      id: row.id,
      set_index: row.set_index,
      values: row.values as SetValues,
      set_type: row.set_type,
      is_completed: row.is_completed,
      notes: row.notes,
      logged_at: row.logged_at,
    });
    setsBySessionExercise.set(row.session_exercise_id, existing);
  }

  return sessionExerciseRows.map((row) => {
    const rawExercise = row.exercises as unknown as ExerciseWithSchema;

    return {
      id: row.id,
      session_id: row.session_id,
      exercise_id: row.exercise_id,
      order_index: row.order_index,
      notes: row.notes,
      rest_seconds: row.rest_seconds,
      exercise: {
        ...rawExercise,
        tracking_schema: TrackingSchemaValidator.parse(rawExercise.tracking_schema),
      },
      sets: setsBySessionExercise.get(row.id) ?? [],
    };
  });
}

async function loadHistorySessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  exerciseId: string,
): Promise<ProgressHistorySession[]> {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(`
      session_id,
      exercise_id,
      workout_sessions!inner (
        completed_at
      ),
      set_entries (
        set_index,
        values,
        set_type,
        is_completed,
        logged_at
      )
    `)
    .eq('exercise_id', exerciseId)
    .not('workout_sessions.completed_at', 'is', null);

  if (error) throw error;

  const historyRows = (data ?? []) as Array<{
    session_id: string;
    exercise_id: string;
    workout_sessions: { completed_at: string } | null;
    set_entries: Array<{
      set_index: number;
      values: Json;
      set_type: string;
      is_completed: boolean;
      logged_at: string | null;
    }>;
  }>;

  return historyRows
    .map((row) => ({
      sessionId: row.session_id,
      completedAt: row.workout_sessions?.completed_at as string,
      sets: (row.set_entries ?? []).map((set) => ({
        set_index: set.set_index,
        values: set.values as SetValues,
        set_type: set.set_type,
        is_completed: set.is_completed,
        logged_at: set.logged_at,
      })),
    }))
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

async function buildAlreadyCompletedResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  startedAt: string,
  completedAt: string,
): Promise<CompleteWorkoutResponse> {
  const exercises = await loadSessionContext(supabase, sessionId);
  const exerciseIds = exercises.map((exercise) => exercise.exercise_id);
  const [prsResult, suggestionsResult] = await Promise.all([
    exerciseIds.length > 0
      ? supabase
          .from('personal_records')
          .select('exercise_id, record_type, record_value')
          .eq('session_id', sessionId)
      : { data: [], error: null },
    exerciseIds.length > 0
      ? supabase
          .from('ai_suggestions')
          .select('exercise_id, suggestion_data')
          .in('exercise_id', exerciseIds)
      : { data: [], error: null },
  ]);

  if (prsResult.error) throw prsResult.error;
  if (suggestionsResult.error) throw suggestionsResult.error;

  const suggestionsByExercise = new Map<string, CompleteWorkoutResponse['suggestions'][number]['suggestion']>();
  for (const row of (suggestionsResult.data ?? []) as Array<{ exercise_id: string; suggestion_data: Json }>) {
    const parsed = AISuggestionDataSchema.safeParse(row.suggestion_data);
    suggestionsByExercise.set(row.exercise_id, parsed.success ? parsed.data : null);
  }

  return {
    sessionId,
    summary: buildSummary(startedAt, exercises, completedAt),
    newPrs: (prsResult.data ?? []) as CompleteWorkoutResponse['newPrs'],
    exerciseNames: exercises.map((exercise) => exercise.exercise.name),
    suggestions: exercises.map((exercise) => ({
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.exercise.name,
      suggestion: suggestionsByExercise.get(exercise.exercise_id) ?? null,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const payload = CompleteWorkoutRequestSchema.parse(await request.json());
    const supabase = await createClient();

    const [{ data: authData, error: authError }, { data: userRow, error: userError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('users').select('unit_preference, training_goals, experience_level, preferred_rep_range').single(),
    ]);

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = authData.user;
    const unitPreference: UnitPreference = (userRow?.unit_preference as UnitPreference | undefined) ?? 'kg';
    const trainingGoals: string[] = (userRow as { training_goals?: string[] } | null)?.training_goals ?? [];
    const experienceLevel: string = (userRow as { experience_level?: string } | null)?.experience_level ?? 'intermediate';
    const preferredRepRange = (userRow as { preferred_rep_range?: { min: number; max: number } | null } | null)?.preferred_rep_range ?? null;

    if (userError) {
      console.warn('[api/workouts/complete] failed to load user preferences', userError);
    }

    const { data: session, error: sessionError } = await supabase
      .from('workout_sessions')
      .select('id, user_id, template_id, started_at, completed_at, duration_seconds')
      .eq('id', payload.sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Workout session not found' }, { status: 404 });
    }

    if (session.completed_at) {
      const completedResponse = await buildAlreadyCompletedResponse(
        supabase,
        session.id,
        session.started_at,
        session.completed_at,
      );
      return NextResponse.json(completedResponse);
    }

    const { data: sessionExercises, error: sessionExercisesError } = await supabase
      .from('session_exercises')
      .select('id')
      .eq('session_id', session.id);

    if (sessionExercisesError) throw sessionExercisesError;

    const validSessionExerciseIds = new Set((sessionExercises ?? []).map((row) => row.id));
    const setsToSave = payload.exercises.flatMap((exercise) => {
      if (!validSessionExerciseIds.has(exercise.sessionExerciseId)) {
        throw new Error('Workout payload included an exercise that does not belong to this session.');
      }

      return exercise.sets.map((set) => ({
        session_exercise_id: exercise.sessionExerciseId,
        set_index: set.setIndex,
        values: set.values as Json,
        set_type: set.setType,
        is_completed: set.isCompleted,
        notes: set.notes ?? null,
      }));
    });

    if (setsToSave.length > 0) {
      const { error: saveError } = await supabase
        .from('set_entries')
        .upsert(setsToSave, { onConflict: 'session_exercise_id,set_index' });
      if (saveError) throw saveError;
    }

    const completedAt = new Date().toISOString();
    const exercisesAfterSave = await loadSessionContext(supabase, session.id);
    const summary = buildSummary(session.started_at, exercisesAfterSave, completedAt);

    const { error: sessionUpdateError } = await supabase
      .from('workout_sessions')
      .update({
        completed_at: completedAt,
        duration_seconds: summary.duration_seconds,
      })
      .eq('id', session.id);

    if (sessionUpdateError) throw sessionUpdateError;

    if (session.template_id) {
      const { error: templateError } = await supabase
        .from('workout_templates')
        .update({ last_used_at: completedAt })
        .eq('id', session.template_id);
      if (templateError) {
        console.warn('[api/workouts/complete] failed to update template last_used_at', templateError);
      }
    }

    const exerciseIds = exercisesAfterSave.map((exercise) => exercise.exercise_id);
    const snapshotRows = buildSnapshotRows(exercisesAfterSave, user.id, session.id, completedAt);
    if (snapshotRows.length > 0) {
      const { error: snapshotError } = await supabase
        .from('last_performance_snapshots')
        .upsert(snapshotRows, { onConflict: 'user_id,exercise_id' });
      if (snapshotError) {
        console.warn('[api/workouts/complete] failed to update last performance snapshots', snapshotError);
      }
    }

    const existingPrsResult = exerciseIds.length > 0
      ? await supabase
          .from('personal_records')
          .select('exercise_id, record_type, record_value')
          .eq('user_id', user.id)
          .in('exercise_id', exerciseIds)
      : { data: [], error: null };

    if (existingPrsResult.error) {
      console.warn('[api/workouts/complete] failed to load existing PRs', existingPrsResult.error);
    }

    const { newPrs, rows: prRows } = detectPersonalRecords(
      exercisesAfterSave,
      (existingPrsResult.data ?? []) as ExistingPrRow[],
      user.id,
      session.id,
      completedAt,
    );

    if (prRows.length > 0) {
      const { error: prError } = await supabase
        .from('personal_records')
        .upsert(prRows, { onConflict: 'user_id,exercise_id,record_type' });
      if (prError) {
        console.warn('[api/workouts/complete] failed to upsert personal records', prError);
      }
    }

    const previousSuggestionsResult = exerciseIds.length > 0
      ? await supabase
          .from('ai_suggestions')
          .select('exercise_id, history_snapshot')
          .eq('user_id', user.id)
          .in('exercise_id', exerciseIds)
      : { data: [], error: null };

    if (previousSuggestionsResult.error) {
      console.warn('[api/workouts/complete] failed to load previous suggestion history', previousSuggestionsResult.error);
    }

    const previousHistoryByExercise = new Map<string, Json | null>();
    for (const row of (previousSuggestionsResult.data ?? []) as Array<{ exercise_id: string; history_snapshot: Json | null }>) {
      previousHistoryByExercise.set(row.exercise_id, row.history_snapshot);
    }

    const suggestionRows: Array<{
      user_id: string;
      exercise_id: string;
      suggestion_data: Json;
      history_snapshot: Json;
      model_version: string;
      expires_at: string;
    }> = [];

    const responseSuggestions: CompleteWorkoutResponse['suggestions'] = [];

    // Load target_ranges from template if workout came from one
    const targetRangesByExercise = new Map<string, Record<string, { min?: number; max?: number }> | null>();
    if (session.template_id) {
      const { data: templateExercises } = await supabase
        .from('template_exercises')
        .select('exercise_id, target_ranges')
        .eq('template_id', session.template_id);
      for (const te of (templateExercises ?? []) as Array<{ exercise_id: string; target_ranges: Json | null }>) {
        targetRangesByExercise.set(te.exercise_id, te.target_ranges as Record<string, { min?: number; max?: number }> | null);
      }
    }

    const historySessionsByExercise = new Map(
      await Promise.all(
        exercisesAfterSave.map(async (exercise) => ([
          exercise.exercise_id,
          await loadHistorySessions(supabase, exercise.exercise_id),
        ] as const)),
      ),
    );

    for (const exercise of exercisesAfterSave) {
      const historySessions = historySessionsByExercise.get(exercise.exercise_id) ?? [];
      const guided = buildGuidedSuggestion({
        schema: exercise.exercise.tracking_schema,
        sessions: historySessions,
        previousHistory: parsePreviousProgressionHistory(previousHistoryByExercise.get(exercise.exercise_id)),
        unitPreference,
        generatedAt: completedAt,
        muscleGroups: exercise.exercise.muscle_groups,
        targetRanges: targetRangesByExercise.get(exercise.exercise_id),
        trainingGoals,
        experienceLevel,
        preferredRepRange,
        exerciseNotes: exercise.exercise.notes,
      });

      responseSuggestions.push({
        exercise_id: exercise.exercise_id,
        exercise_name: exercise.exercise.name,
        suggestion: guided?.suggestion ?? null,
      });

      if (!guided) continue;

      const expiresAt = new Date(completedAt);
      expiresAt.setDate(expiresAt.getDate() + 30);

      suggestionRows.push({
        user_id: user.id,
        exercise_id: exercise.exercise_id,
        suggestion_data: guided.suggestion as Json,
        history_snapshot: guided.historySnapshot as Json,
        model_version: 'guided-progression-v2',
        expires_at: expiresAt.toISOString(),
      });
    }

    if (exerciseIds.length > 0) {
      const { error: deleteSuggestionsError } = await supabase
        .from('ai_suggestions')
        .delete()
        .eq('user_id', user.id)
        .in('exercise_id', exerciseIds);
      if (deleteSuggestionsError) {
        console.warn('[api/workouts/complete] failed to clear old suggestions', deleteSuggestionsError);
      }
    }

    if (suggestionRows.length > 0) {
      const { error: insertSuggestionsError } = await supabase
        .from('ai_suggestions')
        .insert(suggestionRows);
      if (insertSuggestionsError) {
        console.warn('[api/workouts/complete] failed to save fresh suggestions', insertSuggestionsError);
      }
    }

    const response: CompleteWorkoutResponse = {
      sessionId: session.id,
      summary,
      newPrs,
      exerciseNames: exercisesAfterSave.map((exercise) => exercise.exercise.name),
      suggestions: responseSuggestions,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[api/workouts/complete]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid workout payload' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to save workout' }, { status: 500 });
  }
}
