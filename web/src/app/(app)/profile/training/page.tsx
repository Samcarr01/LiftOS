'use client';

import { useEffect, useRef, useState } from 'react';
import { Dumbbell, Flame, Heart, Loader2, Timer, Trophy, Zap } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { SelectableRow } from '@/components/ui/selectable-row';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import { useUnitStore } from '@/store/unit-store';

type Experience = 'beginner' | 'intermediate' | 'advanced';

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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from('users')
      .select('training_goals, experience_level, body_weight_kg, preferred_rep_range, prefill_sort_heaviest_first, weekly_workout_target')
      .single()
      .then(({ data }) => {
        const row = data as {
          training_goals: string[];
          experience_level: string;
          body_weight_kg: number | null;
          preferred_rep_range: { min: number; max: number } | null;
          prefill_sort_heaviest_first: boolean | null;
          weekly_workout_target: number | null;
        } | null;
        setGoals(row?.training_goals ?? []);
        setExperience((row?.experience_level as Experience) ?? 'intermediate');
        if (row?.body_weight_kg) {
          setBodyWeight(unit === 'lb' ? String(Math.round(row.body_weight_kg * 2.205)) : String(row.body_weight_kg));
        }
        if (row?.preferred_rep_range) {
          setRepMin(String(row.preferred_rep_range.min));
          setRepMax(String(row.preferred_rep_range.max));
        }
        setHeaviestFirst(row?.prefill_sort_heaviest_first ?? false);
        setWeeklyTarget(row?.weekly_workout_target ?? 4);
        setLoaded(true);
      });
  }, [user, unit]);

  useDebouncedEffect(
    () => {
      if (!user || !loaded) return;
      const supabase = createClient();
      let bodyWeightKg: number | null = null;
      if (bodyWeight.trim()) {
        const parsed = parseFloat(bodyWeight);
        if (!isNaN(parsed) && parsed > 0) {
          bodyWeightKg = unit === 'lb' ? Math.round((parsed / 2.205) * 10) / 10 : parsed;
        }
      }
      const parsedMin = parseInt(repMin);
      const parsedMax = parseInt(repMax);
      const preferredRepRange =
        !isNaN(parsedMin) && !isNaN(parsedMax) && parsedMin > 0 && parsedMax >= parsedMin
          ? { min: parsedMin, max: parsedMax }
          : null;

      void supabase
        .from('users')
        .update({
          training_goals: goals,
          experience_level: experience,
          body_weight_kg: bodyWeightKg,
          preferred_rep_range: preferredRepRange,
          prefill_sort_heaviest_first: heaviestFirst,
          weekly_workout_target: weeklyTarget,
        })
        .eq('id', user.id)
        .then(({ error }) => {
          if (!error) {
            toast.success('Saved', { duration: 2000 });
          } else {
            toast.error('Failed to save');
          }
        });
    },
    [goals, experience, bodyWeight, repMin, repMax, heaviestFirst, weeklyTarget],
    600,
  );

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

        <div className="space-y-2">
          <div className="list-row justify-between">
            <span className="text-sm font-semibold">Experience</span>
            <div className="flex rounded-lg border border-white/10 bg-black/15 p-0.5">
              {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setExperience(level)}
                  className={`h-7 rounded-md px-2.5 text-xs font-semibold capitalize transition-colors ${
                    experience === level
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/70 hover:bg-white/[0.06] hover:text-foreground'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="list-row justify-between">
            <span className="text-sm font-semibold">Weekly goal</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWeeklyTarget((v) => Math.max(1, v - 1))}
                disabled={weeklyTarget <= 1}
                aria-label="Decrease weekly goal"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/15 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                −
              </button>
              <span className="w-9 text-center font-display text-base font-bold tabular-nums">{weeklyTarget}</span>
              <button
                type="button"
                onClick={() => setWeeklyTarget((v) => Math.min(7, v + 1))}
                disabled={weeklyTarget >= 7}
                aria-label="Increase weekly goal"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/15 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                +
              </button>
              <span className="ml-1 text-xs text-muted-foreground">sessions / wk</span>
            </div>
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
