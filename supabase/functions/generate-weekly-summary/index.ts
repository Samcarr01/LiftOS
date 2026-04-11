// @ts-nocheck — Deno runtime; imports via esm.sh / npm: specifier
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'npm:openai';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lift-os.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface SetRow {
  values:       Record<string, number | null>;
  set_type:     string;
  is_completed: boolean;
}

interface SERow {
  exercise_id: string;
  set_entries: SetRow[];
}

interface SessionRow {
  id:         string;
  started_at: string;
}

interface ExerciseRow {
  id:            string;
  name:          string;
  muscle_groups: string[];
}

interface PRRow {
  exercise_id:  string;
  record_type:  string;
  record_value: number;
  achieved_at:  string;
}

interface AIAnalysis {
  greeting:           string;
  whats_working:      string;
  improving_on:       string;
  getting_stronger:   string;
  exercise_callouts:  { name: string; note: string; trajectory?: string }[];
  game_plan:          string[];
  sign_off:           string;
}

interface ExerciseHighlight {
  name:      string;
  volume:    number;
  sets:      number;
  best_set:  string;
  delta_pct: number | null;
}

interface WeeklySummaryData {
  workouts_completed:  number;
  total_volume_kg:     number;
  total_sets:          number;
  strongest_lift:      { exercise: string; value: string } | null;
  most_improved_group: string | null;
  muscle_volume:       Record<string, number>;
  insight:             string | null;
  volume_by_week:      { week: string; volume: number }[];
  muscle_split:        { muscle: string; volume: number; percentage: number }[];
  session_days:        string[];
  prs_this_week:       { exercise: string; record_type: string; value: number }[];
  ai_analysis:         AIAnalysis | null;
  exercise_highlights: ExerciseHighlight[];
  period_days?:        number;
  training_frequency?: { total_days: number; avg_per_week: number };
}

type Mode = 'weekly' | 'rolling_30d';

// ── Date helpers ──────────────────────────────────────────────────────────────

function resolveWeekStart(input: string | undefined): string {
  let d: Date;
  if (input) {
    d = new Date(input + 'T00:00:00Z');
    if (isNaN(d.getTime())) throw new Error('Invalid week_start date');
  } else {
    d = new Date();
    d.setUTCHours(0, 0, 0, 0);
  }
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

function todayISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Epley e1RM ─────────────────────────────────────────────────────────────────

function epley(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// ── Per-exercise aggregation ──────────────────────────────────────────────────

interface ExerciseAgg {
  name:       string;
  volume:     number;
  sets:       number;
  bestWeight: number;
  bestReps:   number;
  bestE1RM:   number;
}

interface AggResult {
  totalVolumeKg:   number;
  totalSets:       number;
  bestE1RM:        number;
  bestExercise:    string;
  bestE1RMLabel:   string;
  muscleVolume:    Record<string, number>;
  exerciseAggs:    Map<string, ExerciseAgg>;
}

function aggregate(
  seRows: SERow[],
  exerciseMap: Map<string, ExerciseRow>,
): AggResult {
  let totalVolumeKg = 0;
  let totalSets     = 0;
  let bestE1RM      = 0;
  let bestExercise  = '';
  let bestE1RMLabel = '';
  const muscleVolume: Record<string, number> = {};
  const exerciseAggs = new Map<string, ExerciseAgg>();

  for (const se of seRows) {
    const ex = exerciseMap.get(se.exercise_id);
    const exName = ex?.name ?? 'Unknown';
    const workingSets = (se.set_entries ?? []).filter(
      (s) => s.is_completed && (s.set_type === 'working' || s.set_type === 'top'),
    );

    if (!exerciseAggs.has(se.exercise_id)) {
      exerciseAggs.set(se.exercise_id, {
        name: exName, volume: 0, sets: 0,
        bestWeight: 0, bestReps: 0, bestE1RM: 0,
      });
    }
    const agg = exerciseAggs.get(se.exercise_id)!;

    for (const s of workingSets) {
      const w = Number(s.values.weight ?? 0);
      const r = Number(s.values.reps   ?? 0);

      if (w > 0 && r > 0) {
        const vol = w * r;
        totalVolumeKg += vol;
        totalSets     += 1;
        agg.volume    += vol;
        agg.sets      += 1;

        const e = epley(w, r);
        if (e > bestE1RM) {
          bestE1RM      = e;
          bestExercise  = exName;
          bestE1RMLabel = `${w}kg × ${r}`;
        }
        if (e > agg.bestE1RM) {
          agg.bestE1RM   = e;
          agg.bestWeight = w;
          agg.bestReps   = r;
        }

        for (const mg of (ex?.muscle_groups ?? [])) {
          muscleVolume[mg] = (muscleVolume[mg] ?? 0) + vol;
        }
      } else if (r > 0) {
        totalSets += 1;
        agg.sets  += 1;
      }
    }
  }

  return {
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    totalSets,
    bestE1RM,
    bestExercise,
    bestE1RMLabel,
    muscleVolume,
    exerciseAggs,
  };
}

function mostImprovedGroup(
  cur: Record<string, number>,
  prev: Record<string, number>,
): string | null {
  let bestGroup = '';
  let bestDelta = -Infinity;

  for (const [group, vol] of Object.entries(cur)) {
    const prevVol = prev[group] ?? 0;
    const delta = vol - prevVol;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestGroup = group;
    }
  }

  return bestGroup || null;
}

// ── AI Insight (structured) ───────────────────────────────────────────────────

async function generateStructuredInsight(
  apiKey: string,
  mode: Mode,
  stats: {
    workouts: number;
    volume: number;
    totalSets: number;
    strongest: string;
    mostImproved: string | null;
    muscleGroups: string[];
    prevVolume: number | null;
    volumeByWeek: { week: string; volume: number }[];
    exerciseHighlights: ExerciseHighlight[];
    prs: { exercise: string; record_type: string; value: number }[];
    sessionDays: string[];
    muscleSplit: { muscle: string; volume: number; percentage: number }[];
    periodDays: number;
    trainingFrequency?: { total_days: number; avg_per_week: number };
  },
): Promise<AIAnalysis | null> {
  const periodLabel = mode === 'rolling_30d' ? 'last 30 days' : 'this week';
  const comparisonLabel = mode === 'rolling_30d' ? 'previous 30-day period' : 'last week';

  const prevDelta = stats.prevVolume != null && stats.prevVolume > 0
    ? `${stats.volume > stats.prevVolume ? '+' : ''}${Math.round((stats.volume - stats.prevVolume) / stats.prevVolume * 100)}% vs ${comparisonLabel}`
    : `first ${periodLabel} on record`;

  const volumeTrend = stats.volumeByWeek
    .map((w) => `${w.week}: ${Math.round(w.volume)}kg`)
    .join(', ');

  const exerciseBreakdown = stats.exerciseHighlights
    .slice(0, 10)
    .map((e) => {
      const delta = e.delta_pct !== null ? ` (${e.delta_pct > 0 ? '+' : ''}${e.delta_pct}% vs ${comparisonLabel})` : '';
      return `- ${e.name}: ${e.sets} sets, ${Math.round(e.volume)}kg volume, best set ${e.best_set}${delta}`;
    })
    .join('\n');

  const prList = stats.prs.length > 0
    ? stats.prs.map((p) => `- ${p.exercise}: ${p.record_type} = ${p.value}`).join('\n')
    : `None in ${periodLabel}`;

  const muscleSplitText = stats.muscleSplit
    .map((m) => `${m.muscle}: ${Math.round(m.percentage)}%`)
    .join(', ');

  const freqText = stats.trainingFrequency
    ? `${stats.trainingFrequency.total_days} total sessions (${stats.trainingFrequency.avg_per_week.toFixed(1)}/week avg)`
    : `${stats.workouts} sessions`;

  const is30d = mode === 'rolling_30d';

  const dataSection =
    `TRAINING PERIOD: ${is30d ? 'Last 30 days' : 'This week'}\n\n` +
    `STATS:\n` +
    `- Training frequency: ${freqText}\n` +
    `- Training days: ${stats.sessionDays.join(', ') || 'none logged'}\n` +
    `- Total volume: ${stats.volume}kg (${stats.totalSets} working sets)\n` +
    `- Weekly volume breakdown: ${volumeTrend || 'no data'}\n` +
    `- Comparison: ${prevDelta}\n` +
    `- Strongest lift: ${stats.strongest}\n` +
    `- Most improved muscle group: ${stats.mostImproved ?? 'N/A'}\n\n` +
    `MUSCLE SPLIT:\n${muscleSplitText || 'N/A'}\n\n` +
    `EXERCISE BREAKDOWN:\n${exerciseBreakdown || 'No exercises logged'}\n\n` +
    `PERSONAL RECORDS HIT:\n${prList}`;

  const prompt = is30d
    ? `Write a personal coaching check-in for your client based on their last 30 days of training.\n\n` +
      `${dataSection}\n\n` +
      `INSTRUCTIONS:\n` +
      `Respond with a JSON object (no markdown, no code fences). The JSON must have exactly these fields:\n` +
      `{\n` +
      `  "greeting": "A warm, personal opening that references something specific from their training. Address them directly with 'you'. (max 40 words)",\n` +
      `  "whats_working": "A flowing paragraph (4-6 sentences) celebrating what they've been doing well. Be specific: name exercises, cite numbers, mention volume jumps, PRs hit, consistent training days, muscle groups they've prioritised. Sound like a proud coach genuinely impressed with the work.",\n` +
      `  "improving_on": "A flowing paragraph (4-6 sentences) about what they can work on next. Be direct and constructive — point out muscle imbalances, exercises that have stalled, low volume areas, missed sessions, or anything that's slipping. Frame it as coaching, not criticism. Use specific numbers and exercise names.",\n` +
      `  "getting_stronger": "A flowing paragraph (4-6 sentences) directly answering 'are you actually getting stronger?'. Look at e1RM trends, weight progression on key lifts, PR frequency, and volume changes. Be honest — if they're plateauing on bench but progressing on squat, say exactly that. Use the actual numbers.",\n` +
      `  "exercise_callouts": [{"name": "Exercise Name", "note": "specific observation about this exercise", "trajectory": "improving|stalled|declining"}],\n` +
      `  "game_plan": ["3 concrete, actionable things to focus on next, e.g. 'Add 2 sets of face pulls on push days to balance pressing volume'"],\n` +
      `  "sign_off": "A brief, genuine motivational closing line (max 20 words)"\n` +
      `}\n\n` +
      `RULES:\n` +
      `1. Write like a real coach talking to their client — warm, direct, specific. Not clinical or robotic.\n` +
      `2. Always use 'you' and 'your' — this is a personal conversation, not a third-person analysis.\n` +
      `3. Use the actual numbers, exercise names, and percentages from the data above.\n` +
      `4. whats_working, improving_on, and getting_stronger should each be flowing prose paragraphs — NOT bullet lists, NOT structured headings, just natural sentences a coach would write.\n` +
      `5. Be honest. If they're declining, say so directly but constructively ("Your leg volume has dropped 30% this month — that's worth addressing"). Don't sugarcoat.\n` +
      `6. If they're crushing it, sound genuinely enthusiastic ("You've added 7.5kg to your bench top set in 30 days — that's serious progress").\n` +
      `7. game_plan must be concrete ("Add 2 sets of face pulls on push days") not vague ("work on balance").\n` +
      `8. exercise_callouts should cover 3-5 of the most notable exercises with trajectory assessment.\n` +
      `9. Don't invent data that wasn't provided.\n` +
      `10. Output ONLY the JSON object, nothing else.`
    : `Write a brief weekly coaching note for your client.\n\n` +
      `${dataSection}\n\n` +
      `INSTRUCTIONS:\n` +
      `Respond with a JSON object (no markdown, no code fences). The JSON must have exactly these fields:\n` +
      `{\n` +
      `  "greeting": "A brief, warm opening referencing this week's training (max 25 words)",\n` +
      `  "whats_working": "2-3 sentences celebrating what went well this week. Specific: numbers, exercises, sessions.",\n` +
      `  "improving_on": "2-3 sentences on what to focus on. Direct, constructive, specific.",\n` +
      `  "getting_stronger": "2-3 sentences honestly assessing strength progress this week. Use actual numbers.",\n` +
      `  "exercise_callouts": [{"name": "Exercise Name", "note": "specific observation"}],\n` +
      `  "game_plan": ["1-2 actionable suggestions for next week"],\n` +
      `  "sign_off": "Brief motivational closing (max 15 words)"\n` +
      `}\n\n` +
      `RULES:\n` +
      `1. Write like a coach — warm, direct, use 'you/your'. Flowing prose, not bullets.\n` +
      `2. Be specific with numbers and exercise names from the data.\n` +
      `3. exercise_callouts: 2-4 notable exercises.\n` +
      `4. Don't invent data. Output ONLY the JSON object.`;

  const openai = new OpenAI({ apiKey });

  const systemMessage = is30d
    ? 'You are an experienced personal strength coach writing a monthly check-in to your client. You know them well. Write in second person ("You\'ve been...", "Your bench press..."). Be warm but honest — celebrate wins genuinely, give constructive criticism directly, and be specific with numbers. Respond with valid JSON only, no markdown.'
    : 'You are a strength coach writing a quick weekly note to your client. Be warm, specific, and direct. Respond with valid JSON only, no markdown.';

  const response = await openai.chat.completions.create({
    model:       'gpt-5',
    temperature: is30d ? 0.5 : 0.4,
    max_tokens:  is30d ? 1800 : 800,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user',   content: prompt },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned) as AIAnalysis;
    if (!parsed.greeting || !parsed.whats_working || !parsed.improving_on || !parsed.getting_stronger) return null;
    return parsed;
  } catch {
    console.error('[generate-weekly-summary] Failed to parse AI JSON:', raw.slice(0, 200));
    return null;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const mode: Mode = body.mode === 'rolling_30d' ? 'rolling_30d' : 'weekly';
    const forceRefresh = body.force === true;

    // ── Determine date range based on mode ────────────────────────────────
    let rangeStart: string;
    let rangeEnd: string;
    let cacheKey: string;
    let prevRangeStart: string;
    let prevRangeEnd: string;

    if (mode === 'rolling_30d') {
      const today = todayISO();
      rangeEnd = addDays(today, 1); // exclusive end
      rangeStart = addDays(today, -29); // 30 days including today
      cacheKey = '9999-12-31';
      prevRangeEnd = rangeStart;
      prevRangeStart = addDays(today, -59); // previous 30-day period
    } else {
      const weekStart = resolveWeekStart(body.week_start as string | undefined);
      rangeStart = weekStart;
      rangeEnd = addDays(weekStart, 7);
      cacheKey = weekStart;
      prevRangeStart = addDays(weekStart, -7);
      prevRangeEnd = weekStart;
    }

    // ── Check cache ───────────────────────────────────────────────────────
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('weekly_summaries')
        .select('summary_data')
        .eq('user_id', user.id)
        .eq('week_start', cacheKey)
        .maybeSingle();

      if (cached?.summary_data) {
        return json({ data: cached.summary_data, week_start: cacheKey, source: 'cached' });
      }
    }

    // ── Fetch sessions in range ──────────────────────────────────────────
    const { data: sessions } = await supabase
      .from('workout_sessions')
      .select('id, started_at')
      .eq('user_id', user.id)
      .gte('started_at', rangeStart + 'T00:00:00Z')
      .lt('started_at',  rangeEnd   + 'T00:00:00Z')
      .not('completed_at', 'is', null);

    const sessionList = (sessions ?? []) as SessionRow[];
    const sessionIds = sessionList.map((s) => s.id);

    // Extract training days
    const sessionDays = [...new Set(
      sessionList.map((s) => DAY_NAMES[new Date(s.started_at).getUTCDay()])
    )];

    // Training frequency for 30-day mode
    const uniqueTrainingDates = new Set(
      sessionList.map((s) => s.started_at.split('T')[0]),
    );
    const trainingFrequency = mode === 'rolling_30d'
      ? { total_days: uniqueTrainingDates.size, avg_per_week: Math.round((uniqueTrainingDates.size / 30) * 7 * 10) / 10 }
      : undefined;

    // ── Fetch session exercises + set_entries ─────────────────────────────
    const { data: seRows } = sessionIds.length
      ? await supabase
          .from('session_exercises')
          .select('exercise_id, set_entries ( values, set_type, is_completed )')
          .in('session_id', sessionIds)
      : { data: [] };

    // ── Fetch exercise metadata ───────────────────────────────────────────
    const exerciseIds = [...new Set((seRows ?? []).map((se: SERow) => se.exercise_id))];
    const { data: exerciseRows } = exerciseIds.length
      ? await supabase
          .from('exercises')
          .select('id, name, muscle_groups')
          .in('id', exerciseIds)
      : { data: [] };

    const exerciseMap = new Map<string, ExerciseRow>(
      (exerciseRows ?? []).map((e: ExerciseRow) => [e.id, e]),
    );

    // ── Aggregate current period ─────────────────────────────────────────
    const cur = aggregate(seRows ?? [], exerciseMap);

    // ── Fetch PRs in range ───────────────────────────────────────────────
    const { data: prRows } = await supabase
      .from('personal_records')
      .select('exercise_id, record_type, record_value, achieved_at')
      .eq('user_id', user.id)
      .gte('achieved_at', rangeStart + 'T00:00:00Z')
      .lt('achieved_at', rangeEnd + 'T00:00:00Z');

    const prsInPeriod = (prRows ?? []).map((pr: PRRow) => ({
      exercise:    exerciseMap.get(pr.exercise_id)?.name ?? 'Unknown',
      record_type: pr.record_type,
      value:       pr.record_value,
    }));

    // ── Build volume-by-week from raw session data ────────────────────────
    const volumeByWeek: { week: string; volume: number }[] = [];

    if (mode === 'rolling_30d') {
      // Compute weekly buckets from raw sessions (4-5 weeks)
      // Bucket sessions by week start (Monday)
      const weekBuckets = new Map<string, SERow[]>();

      // We need per-session exercise data, so re-query with session_id linkage
      const sessionDateMap = new Map<string, string>();
      for (const s of sessionList) {
        sessionDateMap.set(s.id, s.started_at);
      }

      // Fetch session_exercises with session_id for bucketing
      const { data: seWithSession } = sessionIds.length
        ? await supabase
            .from('session_exercises')
            .select('session_id, exercise_id, set_entries ( values, set_type, is_completed )')
            .in('session_id', sessionIds)
        : { data: [] };

      for (const se of (seWithSession ?? [])) {
        const sessionDate = sessionDateMap.get(se.session_id);
        if (!sessionDate) continue;
        const d = new Date(sessionDate);
        const day = d.getUTCDay();
        const offset = day === 0 ? -6 : 1 - day;
        const monday = new Date(d);
        monday.setUTCDate(monday.getUTCDate() + offset);
        const weekKey = monday.toISOString().split('T')[0];
        if (!weekBuckets.has(weekKey)) weekBuckets.set(weekKey, []);
        weekBuckets.get(weekKey)!.push(se);
      }

      // Sort weeks chronologically
      const sortedWeeks = [...weekBuckets.keys()].sort();
      for (const weekKey of sortedWeeks) {
        const weekSEs = weekBuckets.get(weekKey)!;
        const weekAgg = aggregate(weekSEs, exerciseMap);
        volumeByWeek.push({ week: weekKey, volume: weekAgg.totalVolumeKg });
      }
    } else {
      // Weekly mode: fetch from cached summaries (last 4 weeks)
      const weeksToFetch = [
        addDays(rangeStart, -21),
        addDays(rangeStart, -14),
        addDays(rangeStart, -7),
        rangeStart,
      ];

      const { data: prevSummaries } = await supabase
        .from('weekly_summaries')
        .select('week_start, summary_data')
        .eq('user_id', user.id)
        .in('week_start', weeksToFetch.slice(0, 3));

      const prevSummaryMap = new Map(
        (prevSummaries ?? []).map((s: { week_start: string; summary_data: WeeklySummaryData }) => [
          s.week_start, s.summary_data,
        ]),
      );

      for (const w of weeksToFetch) {
        if (w === rangeStart) {
          volumeByWeek.push({ week: w, volume: cur.totalVolumeKg });
        } else {
          const prev = prevSummaryMap.get(w);
          volumeByWeek.push({ week: w, volume: prev?.total_volume_kg ?? 0 });
        }
      }
    }

    // ── Previous period data for deltas ───────────────────────────────────
    let prevVolumeKg: number | null = null;
    let prevMuscleVolume: Record<string, number> = {};
    let prevExerciseVolumes: Record<string, number> = {};

    if (mode === 'rolling_30d') {
      // Fetch previous 30-day period sessions directly
      const { data: prevSessions } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('user_id', user.id)
        .gte('started_at', prevRangeStart + 'T00:00:00Z')
        .lt('started_at',  prevRangeEnd  + 'T00:00:00Z')
        .not('completed_at', 'is', null);

      const prevSessionIds = (prevSessions ?? []).map((s: { id: string }) => s.id);

      if (prevSessionIds.length > 0) {
        const { data: prevSERows } = await supabase
          .from('session_exercises')
          .select('exercise_id, set_entries ( values, set_type, is_completed )')
          .in('session_id', prevSessionIds);

        const prevAgg = aggregate(prevSERows ?? [], exerciseMap);
        prevVolumeKg = prevAgg.totalVolumeKg;
        prevMuscleVolume = prevAgg.muscleVolume;
        for (const [, agg] of prevAgg.exerciseAggs) {
          prevExerciseVolumes[agg.name] = agg.volume;
        }
      }
    } else {
      // Weekly mode: use cached previous week
      const prevCacheKey = addDays(rangeStart, -7);
      const { data: prevCached } = await supabase
        .from('weekly_summaries')
        .select('summary_data')
        .eq('user_id', user.id)
        .eq('week_start', prevCacheKey)
        .maybeSingle();

      const prevData = prevCached?.summary_data as WeeklySummaryData | null;
      prevMuscleVolume = prevData?.muscle_volume ?? {};
      prevVolumeKg = prevData?.total_volume_kg ?? null;
      if (prevData?.exercise_highlights) {
        for (const eh of prevData.exercise_highlights) {
          prevExerciseVolumes[eh.name] = eh.volume;
        }
      }
    }

    const improvedGroup = mostImprovedGroup(cur.muscleVolume, prevMuscleVolume);

    // ── Build muscle split ────────────────────────────────────────────────
    const totalMuscleVol = Object.values(cur.muscleVolume).reduce((a, b) => a + b, 0);
    const muscleSplit = Object.entries(cur.muscleVolume)
      .sort((a, b) => b[1] - a[1])
      .map(([muscle, volume]) => ({
        muscle,
        volume: Math.round(volume),
        percentage: totalMuscleVol > 0 ? Math.round((volume / totalMuscleVol) * 100) : 0,
      }));

    // ── Build exercise highlights ─────────────────────────────────────────
    const exerciseHighlights: ExerciseHighlight[] = [...cur.exerciseAggs.values()]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map((agg) => {
        const prevVol = prevExerciseVolumes[agg.name] ?? null;
        const deltaPct = prevVol !== null && prevVol > 0
          ? Math.round(((agg.volume - prevVol) / prevVol) * 100)
          : null;
        return {
          name:      agg.name,
          volume:    Math.round(agg.volume),
          sets:      agg.sets,
          best_set:  agg.bestWeight > 0 ? `${agg.bestWeight}kg × ${agg.bestReps}` : `${agg.bestReps} reps`,
          delta_pct: deltaPct,
        };
      });

    // ── Build summary data ────────────────────────────────────────────────
    const summaryData: WeeklySummaryData = {
      workouts_completed:  sessionIds.length,
      total_volume_kg:     cur.totalVolumeKg,
      total_sets:          cur.totalSets,
      strongest_lift:      cur.bestExercise
        ? { exercise: cur.bestExercise, value: cur.bestE1RMLabel }
        : null,
      most_improved_group: improvedGroup,
      muscle_volume:       cur.muscleVolume,
      insight:             null,
      volume_by_week:      volumeByWeek,
      muscle_split:        muscleSplit,
      session_days:        sessionDays,
      prs_this_week:       prsInPeriod,
      ai_analysis:         null,
      exercise_highlights: exerciseHighlights,
      period_days:         mode === 'rolling_30d' ? 30 : 7,
      training_frequency:  trainingFrequency,
    };

    // ── AI analysis ───────────────────────────────────────────────────────
    try {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

      const aiResult = await generateStructuredInsight(apiKey, mode, {
        workouts:           sessionIds.length,
        volume:             cur.totalVolumeKg,
        totalSets:          cur.totalSets,
        strongest:          cur.bestExercise
          ? `${cur.bestExercise} at ${cur.bestE1RMLabel}`
          : 'N/A',
        mostImproved:       improvedGroup,
        muscleGroups:       Object.keys(cur.muscleVolume),
        prevVolume:         prevVolumeKg,
        volumeByWeek,
        exerciseHighlights,
        prs:                prsInPeriod,
        sessionDays,
        muscleSplit,
        periodDays:         mode === 'rolling_30d' ? 30 : 7,
        trainingFrequency,
      });

      summaryData.ai_analysis = aiResult;
      if (aiResult?.greeting) {
        summaryData.insight = aiResult.greeting;
      }

      console.log(`[generate-weekly-summary] AI analysis generated (${mode}) for user`, user.id);
    } catch (aiErr) {
      console.error('[generate-weekly-summary] AI analysis failed:', (aiErr as Error).message);
    }

    // ── Upsert ────────────────────────────────────────────────────────────
    await supabase
      .from('weekly_summaries')
      .upsert(
        {
          user_id:      user.id,
          week_start:   cacheKey,
          summary_data: summaryData,
        },
        { onConflict: 'user_id,week_start' },
      );

    return json({ data: summaryData, week_start: cacheKey, source: 'generated' });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[generate-weekly-summary] Fatal:', message);
    return json({ error: message }, 500);
  }
});
