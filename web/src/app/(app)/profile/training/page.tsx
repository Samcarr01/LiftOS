'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import { useUnitStore } from '@/store/unit-store';

type Experience = 'beginner' | 'intermediate' | 'advanced';

const GOALS = [
  { id: 'strength', label: 'Strength' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'fat_loss', label: 'Fat Loss' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'athletic', label: 'Athletic' },
  { id: 'health', label: 'Health' },
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
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from('users')
      .select('training_goals, experience_level, body_weight_kg, preferred_rep_range')
      .single()
      .then(({ data }) => {
        const row = data as {
          training_goals: string[];
          experience_level: string;
          body_weight_kg: number | null;
          preferred_rep_range: { min: number; max: number } | null;
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
        })
        .eq('id', user.id)
        .then(({ error }) => {
          if (!error) {
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          } else {
            toast.error('Failed to save');
          }
        });
    },
    [goals, experience, bodyWeight, repMin, repMax],
    600,
  );

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Profile
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Training</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your goals and defaults. Saves automatically.</p>
          </div>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-[oklch(0.72_0.19_155)]">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
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
                    experience === level ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {level}
                </button>
              ))}
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

          <div className="list-row flex-col items-stretch gap-2">
            <span className="text-sm font-semibold">Goals</span>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((goal) => {
                const selected = goals.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    onClick={() =>
                      setGoals((prev) =>
                        prev.includes(goal.id) ? prev.filter((g) => g !== goal.id) : [...prev, goal.id],
                      )
                    }
                    className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                      selected
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-white/10 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {goal.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
