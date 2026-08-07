'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, Dumbbell, Flame, Heart, Loader2, Timer, TrendingDown, TrendingUp, Trophy, Zap } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { SelectableRow } from '@/components/ui/selectable-row';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  createTrainingPreferencesAdapter,
  formatBodyWeightInput,
  localCalendarDay,
  parseBodyWeightKg,
  saveTrainingPreferences,
} from '@/lib/profile/save-training-preferences';
import type { TrainingPreferencesClient } from '@/lib/profile/save-training-preferences';
import { normalizeTrainingPhase } from '@/lib/workout/complete-workout-persistence';
import { useAuthStore } from '@/store/auth-store';
import { useUnitStore } from '@/store/unit-store';
import type { TrainingPhase } from '@/types/training-context';

const STAGE_IDS = [
  'just-starting',
  'novice',
  'early-intermediate',
  'intermediate',
  'advanced-intermediate',
  'advanced',
  'elite',
] as const;

type Experience = (typeof STAGE_IDS)[number];

const OLD_TO_NEW: Record<string, Experience> = {
  beginner: 'just-starting',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

function mapOldStageToNew(v: string): Experience | null {
  if (STAGE_IDS.includes(v as Experience)) return v as Experience;
  return OLD_TO_NEW[v] ?? null;
}

const STAGE_LABELS: Record<Experience, string> = {
  'just-starting': 'Just Starting',
  'novice': 'Novice',
  'early-intermediate': 'Early Intermediate',
  'intermediate': 'Intermediate',
  'advanced-intermediate': 'Advanced Intermediate',
  'advanced': 'Advanced',
  'elite': 'Elite',
};

// Same goal set + icons as onboarding, so editing goals here matches the
// screen the user first saw.
const GOALS = [
  { id: 'strength', label: 'Strength', icon: Zap },
  { id: 'muscle', label: 'Muscle', icon: Dumbbell },
  { id: 'fat_loss', label: 'Fat Loss', icon: Flame },
  { id: 'endurance', label: 'Endurance', icon: Timer },
  { id: 'athletic', label: 'Athletic', icon: Trophy },
  { id: 'health', label: 'Health', icon: Heart },
] as const;

// Phase describes what the lifter is training *for* right now. It changes the
// targets they are given, never the history they have logged.
const PHASES = [
  { id: 'build',    label: 'Build',    icon: TrendingUp,   description: 'Adding size and strength' },
  { id: 'maintain', label: 'Maintain', icon: Activity,     description: 'Holding what you have' },
  { id: 'cut',      label: 'Cut',      icon: TrendingDown, description: 'Losing fat, keeping strength' },
] as const satisfies ReadonlyArray<{ id: TrainingPhase; label: string; icon: typeof Activity; description: string }>;

/** "7 Aug" for a real stored stamp, or null for anything unreadable. */
function formatPhaseStart(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const date = new Date(startedAt);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function useDebouncedEffect(fn: () => void, deps: unknown[], delay: number) {
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = setTimeout(fn, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function TrainingPreferencesPage() {
  const user = useAuthStore((state) => state.user);
  const { unit } = useUnitStore();

  const [goals, setGoals] = useState<string[]>([]);
  const [experience, setExperience] = useState<Experience>('intermediate');
  const [bodyWeight, setBodyWeight] = useState('');
  const [repMin, setRepMin] = useState('');
  const [repMax, setRepMax] = useState('');
  const [heaviestFirst, setHeaviestFirst] = useState(false);
  const [weeklyTarget, setWeeklyTarget] = useState(4);
  const [phase, setPhase] = useState<TrainingPhase | null>(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The canonical kg last written to `users.body_weight_kg`. A weigh-in is a
  // change against *this*, not against whatever is in the input — the autosave
  // re-fires on every unrelated edit with the same number still in the field.
  const lastSavedBodyWeightKg = useRef<number | null>(null);
  // The phase last known to be stored. `training_phase_started_at` moves only
  // when the selection differs from *this*, so the debounced autosave — which
  // re-fires on every unrelated edit — cannot keep resetting "cutting since".
  const lastSavedPhase = useRef<TrainingPhase | null>(null);
  // Autosaves are serialised through one chain, so an older network write can
  // never land after a newer one, and numbered so a save that is overtaken
  // mid-flight knows to stay quiet.
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveGeneration = useRef(0);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from('users')
      .select('training_goals, experience_level, body_weight_kg, preferred_rep_range, prefill_sort_heaviest_first, weekly_workout_target, training_phase, training_phase_started_at')
      .single()
      .then(({ data }) => {
        const row = data as {
          training_goals: string[];
          experience_level: string;
          body_weight_kg: number | null;
          preferred_rep_range: { min: number; max: number } | null;
          prefill_sort_heaviest_first: boolean | null;
          weekly_workout_target: number | null;
          training_phase: string | null;
          training_phase_started_at: string | null;
        } | null;
        setGoals(row?.training_goals ?? []);
        setExperience(mapOldStageToNew(row?.experience_level as string) ?? 'intermediate');
        lastSavedBodyWeightKg.current = row?.body_weight_kg ?? null;
        if (row?.body_weight_kg) {
          // The exact inverse of the parse the autosave applies, so simply
          // looking at this screen in pounds is never mistaken for a weigh-in.
          setBodyWeight(formatBodyWeightInput(row.body_weight_kg, unit));
        }
        if (row?.preferred_rep_range) {
          setRepMin(String(row.preferred_rep_range.min));
          setRepMax(String(row.preferred_rep_range.max));
        }
        setHeaviestFirst(row?.prefill_sort_heaviest_first ?? false);
        setWeeklyTarget(row?.weekly_workout_target ?? 4);
        // The server value wins on reload. An unreadable one selects nothing
        // rather than guessing Build — the column's default is the database's
        // to apply, and a cutting lifter must not silently be shown Build.
        const storedPhase = normalizeTrainingPhase(row?.training_phase);
        setPhase(storedPhase);
        lastSavedPhase.current = storedPhase;
        setPhaseStartedAt(row?.training_phase_started_at ?? null);
        setLoaded(true);
      });
  }, [user, unit]);

  useDebouncedEffect(
    () => {
      if (!user || !loaded) return;
      const supabase = createClient();
      const parsedMin = parseInt(repMin);
      const parsedMax = parseInt(repMax);
      const preferredRepRange =
        !isNaN(parsedMin) && !isNaN(parsedMax) && parsedMin > 0 && parsedMax >= parsedMin
          ? { min: parsedMin, max: parsedMax }
          : null;

      const savedAt = new Date();

      // A weigh-in, not a keystroke: history is written only when the canonical
      // number differs from what actually reached the column last time.
      const canonicalBodyWeightKg = parseBodyWeightKg(bodyWeight, unit);
      const isWeighIn = canonicalBodyWeightKg !== lastSavedBodyWeightKg.current;

      const generation = saveGeneration.current + 1;
      saveGeneration.current = generation;

      // The baseline this save is compared against, read where the save is
      // performed rather than where it is enqueued, and kept so the toast half
      // below can tell whether the helper stamped.
      let baselinePhase: TrainingPhase | null = null;

      saveChain.current = saveChain.current
        .catch(() => undefined)
        .then(() => {
          // Thumbs are faster than networks. Tapping Cut and then Build again
          // inside one slow round trip queues this save while the first is
          // still in flight, so the phase on screen when the debounce fired is
          // not the phase the row holds by the time we run.
          baselinePhase = lastSavedPhase.current;

          // The generated Supabase types resolve a query builder per relation,
          // and handing the full client to the adapter makes TypeScript
          // instantiate that whole relation graph (TS2589). The adapter only
          // ever calls `from('users')` and `from('body_weight_logs')`, so the
          // cast is narrowed to exactly that at this one explicit boundary.
          return saveTrainingPreferences(
            createTrainingPreferencesAdapter(supabase as unknown as TrainingPreferencesClient),
            {
              userId: user.id,
              goals,
              experience,
              preferredRepRange,
              prefillSortHeaviestFirst: heaviestFirst,
              weeklyWorkoutTarget: weeklyTarget,
              unit,
              bodyWeight,
              loggedOn: localCalendarDay(savedAt),
              now: savedAt.toISOString(),
              phase,
              currentPhase: baselinePhase,
              recordBodyWeightHistory: isWeighIn,
              isCurrent: () => saveGeneration.current === generation,
            },
          );
        })
        .then((result) => {
          // The authoritative write is never rolled back, so once it lands the
          // row holds this phase whether or not a newer save has taken over the
          // screen. The baseline advances on that fact alone — leaving it
          // behind on a superseded save is what made the save queued behind it
          // read cut→build as build→build and stamp nothing.
          if (result.ok && phase !== null) lastSavedPhase.current = phase;

          // Overtaken mid-flight: not a success to announce, not a failure to
          // report. The save that replaced it owns the toast.
          if (result.superseded) return;

          if (result.ok) {
            lastSavedBodyWeightKg.current = canonicalBodyWeightKg;
            // The stamp the helper just wrote, against the baseline it was
            // actually given — so an unrelated keystroke can no longer look
            // like a phase change.
            if (phase !== null && phase !== baselinePhase) setPhaseStartedAt(savedAt.toISOString());
            if (result.warning !== null) {
              console.warn('[profile/training] body weight saved but not logged:', result.warning);
            }
            toast.success('Saved', { duration: 2000 });
          } else {
            toast.error('Failed to save');
          }
        });
    },
    [goals, experience, bodyWeight, repMin, repMax, heaviestFirst, weeklyTarget, phase],
    600,
  );

  const phaseStartLabel = formatPhaseStart(phaseStartedAt);

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <BackButton href="/profile" label="Back to profile" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Training</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your goals and defaults. Saves automatically.</p>
          </div>
          {!loaded && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Training phase — one selection, saved by the same autosave as
            everything else on this screen. Changing it affects future targets
            only; a completed session keeps the phase it was performed in. */}
        <section aria-label="Training phase" className="space-y-2.5">
          <div>
            <span className="text-sm font-semibold">Training phase</span>
            {phaseStartLabel && (
              <p className="mt-0.5 text-xs text-muted-foreground">Current phase since {phaseStartLabel}</p>
            )}
          </div>
          <div className="space-y-2.5">
            {PHASES.map((option) => (
              <SelectableRow
                key={option.id}
                icon={option.icon}
                title={option.label}
                subtitle={option.description}
                selected={phase === option.id}
                onSelect={() => setPhase(option.id)}
              />
            ))}
          </div>
        </section>

        <div className="space-y-2">
          <div className="content-card !px-4 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-bright">Goal</span>
              <span className="mt-1 font-display text-2xl font-bold">Weekly Sessions</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeeklyTarget((v) => Math.max(1, v - 1))}
                disabled={weeklyTarget <= 1}
                aria-label="Decrease weekly goal"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/15 text-lg font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                −
              </button>
              <div className="flex min-w-[3rem] flex-col items-center">
                <span className="text-center font-display text-3xl font-bold tabular-nums text-primary">{weeklyTarget}</span>
                <span className="text-xs text-muted-foreground">sessions / wk</span>
              </div>
              <button
                type="button"
                onClick={() => setWeeklyTarget((v) => Math.min(7, v + 1))}
                disabled={weeklyTarget >= 7}
                aria-label="Increase weekly goal"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/15 text-lg font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          <div className="list-row justify-between">
            <span className="text-sm font-semibold">Experience</span>
            <select
              value={experience}
              onChange={(e) => setExperience(e.target.value as Experience)}
              className="h-8 rounded-lg border border-white/10 bg-black/15 px-2 text-sm font-medium text-foreground outline-none focus:border-primary/50"
            >
              {STAGE_IDS.map((level) => (
                <option key={level} value={level}>
                  {STAGE_LABELS[level]}
                </option>
              ))}
            </select>
          </div>

          <div className="list-row justify-between">
            <span className="text-sm font-semibold">Rep range</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={repMin}
                onChange={(e) => { if (e.target.value === '' || /^\d+$/.test(e.target.value)) setRepMin(e.target.value); }}
                placeholder="Min"
                className="h-8 w-14 rounded-lg border border-white/10 bg-black/15 px-2 text-center text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="text"
                inputMode="numeric"
                value={repMax}
                onChange={(e) => { if (e.target.value === '' || /^\d+$/.test(e.target.value)) setRepMax(e.target.value); }}
                placeholder="Max"
                className="h-8 w-14 rounded-lg border border-white/10 bg-black/15 px-2 text-center text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              <span className="text-xs text-muted-foreground">reps</span>
            </div>
          </div>

          <div className="list-row items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Heaviest set first</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Reorder auto-filled sets by weight, then reps. Only affects what shows when you start a new workout — never your saved history.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={heaviestFirst}
              onClick={() => setHeaviestFirst((v) => !v)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
                heaviestFirst
                  ? 'border-primary/40 bg-primary/30'
                  : 'border-white/10 bg-black/30'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  heaviestFirst ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="list-row justify-between">
            <span className="text-sm font-semibold">Body weight</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={bodyWeight}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setBodyWeight(v);
                }}
                placeholder="—"
                className="h-8 w-20 rounded-lg border border-white/10 bg-black/15 px-2 text-center text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              <span className="text-xs text-muted-foreground">{unit}</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <span className="text-sm font-semibold">Goals</span>
            <div className="space-y-2.5">
              {GOALS.map((goal) => (
                <SelectableRow
                  key={goal.id}
                  icon={goal.icon}
                  title={goal.label}
                  selected={goals.includes(goal.id)}
                  onSelect={() =>
                    setGoals((prev) =>
                      prev.includes(goal.id) ? prev.filter((g) => g !== goal.id) : [...prev, goal.id],
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
