'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  Flame,
  Heart,
  Loader2,
  Scale,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useUnitStore } from '@/store/unit-store';

type Step = 'welcome' | 'goals' | 'experience' | 'reps' | 'body' | 'units' | 'summary';

const GOALS = [
  { id: 'strength', label: 'Build Strength', description: 'Lift heavier, get stronger', icon: Trophy, color: 'text-[oklch(0.80_0.16_55)]' },
  { id: 'muscle', label: 'Build Muscle', description: 'Grow size and definition', icon: Dumbbell, color: 'text-[oklch(0.78_0.17_155)]' },
  { id: 'fat_loss', label: 'Lose Fat', description: 'Burn calories and lean out', icon: Flame, color: 'text-[oklch(0.75_0.18_25)]' },
  { id: 'endurance', label: 'Improve Endurance', description: 'Go longer, recover faster', icon: Timer, color: 'text-[oklch(0.72_0.15_250)]' },
  { id: 'athletic', label: 'Athletic Performance', description: 'Power, speed, and agility', icon: Swords, color: 'text-[oklch(0.78_0.15_310)]' },
  { id: 'health', label: 'General Health', description: 'Stay fit and feel good', icon: Heart, color: 'text-[oklch(0.75_0.15_150)]' },
] as const;

const EXPERIENCE_LEVELS = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'New to lifting or less than 6 months',
    detail: 'We\'ll suggest smaller weight jumps and progress more frequently',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    description: '6 months to 2 years of consistent training',
    detail: 'Balanced progression — build reps then increase weight',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: '2+ years of serious training',
    detail: 'More patience between progressions, deload awareness',
  },
] as const;

const REP_PRESETS = [
  { id: 'strength', label: 'Low Reps', range: '1–5', min: 1, max: 5, description: 'Pure strength — heavy weight, low reps' },
  { id: 'power', label: 'Strength & Size', range: '3–8', min: 3, max: 8, description: 'Best of both worlds' },
  { id: 'hypertrophy', label: 'Moderate', range: '8–12', min: 8, max: 12, description: 'Classic hypertrophy range' },
  { id: 'endurance', label: 'Higher Reps', range: '12–20', min: 12, max: 20, description: 'Muscular endurance and pump' },
] as const;

const STEPS: Step[] = ['welcome', 'goals', 'experience', 'reps', 'body', 'units', 'summary'];

const GOAL_LABELS: Record<string, string> = {
  strength: 'Strength',
  muscle: 'Muscle',
  fat_loss: 'Fat Loss',
  endurance: 'Endurance',
  athletic: 'Athletic',
  health: 'Health',
};

const EXP_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export default function OnboardingPage() {
  const router = useRouter();
  const { setUnit } = useUnitStore();

  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [selectedRepPreset, setSelectedRepPreset] = useState<string>('');
  const [repMin, setRepMin] = useState<number>(0);
  const [repMax, setRepMax] = useState<number>(0);
  const [bodyWeight, setBodyWeight] = useState('');
  const [weightInputUnit, setWeightInputUnit] = useState<'kg' | 'lb'>('kg');
  const [unitPreference, setUnitPreference] = useState<'kg' | 'lb'>('kg');
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(currentStep);
  // Progress bar excludes welcome and summary
  const progressSteps = STEPS.filter((s): s is Step => s !== 'welcome' && s !== 'summary');
  const progressIndex = progressSteps.indexOf(currentStep);

  function toggleGoal(goalId: string) {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId],
    );
  }

  function selectRepPreset(presetId: string) {
    setSelectedRepPreset(presetId);
    const preset = REP_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setRepMin(preset.min);
      setRepMax(preset.max);
    }
  }

  function nextStep() {
    const next = STEPS[stepIndex + 1];
    if (next) setCurrentStep(next);
  }

  function prevStep() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setCurrentStep(prev);
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const supabase = createClient();

      let bodyWeightKg: number | null = null;
      if (bodyWeight.trim()) {
        const parsed = parseFloat(bodyWeight);
        if (!isNaN(parsed) && parsed > 0) {
          bodyWeightKg = weightInputUnit === 'lb' ? Math.round(parsed / 2.205 * 10) / 10 : parsed;
        }
      }

      const preferredRepRange = repMin > 0 && repMax > 0 && repMax >= repMin
        ? { min: repMin, max: repMax }
        : null;

      const { error } = await supabase.from('users').update({
        training_goals: selectedGoals,
        experience_level: (experienceLevel || 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
        body_weight_kg: bodyWeightKg,
        preferred_rep_range: preferredRepRange,
        unit_preference: unitPreference,
        onboarding_completed: true,
      }).eq('id', (await supabase.auth.getUser()).data.user!.id);

      if (error) throw error;

      setUnit(unitPreference);
      router.replace('/?tutorial=1');
    } catch {
      toast.error('Failed to save preferences');
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('users').update({
        onboarding_completed: true,
      }).eq('id', (await supabase.auth.getUser()).data.user!.id);

      if (error) throw error;
      router.replace('/');
    } catch {
      toast.error('Failed to save');
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-md">

        {/* Progress bar (hidden on welcome and summary) */}
        {currentStep !== 'welcome' && currentStep !== 'summary' && (
          <div className="mb-8 flex gap-1.5">
            {progressSteps.map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1 flex-1 rounded-full transition-all duration-300',
                  i <= progressIndex ? 'bg-primary' : 'bg-white/10',
                )}
              />
            ))}
          </div>
        )}

        {/* ── Welcome ──────────────────────────────────────────────── */}
        {currentStep === 'welcome' && (
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15">
              <Dumbbell className="h-10 w-10 text-primary" />
            </div>
            <h1 className="mt-6 font-display text-3xl font-bold">Welcome to LiftOS</h1>
            <p className="mt-2 text-base text-muted-foreground leading-relaxed">
              Let&apos;s set up your profile so we can tailor your progression targets, rep ranges, and coaching to the way you train.
            </p>
            <p className="mt-1 text-sm text-muted-foreground/60">Takes about 30 seconds</p>

            <button
              onClick={nextStep}
              className="premium-button mt-8 w-full justify-center text-base"
            >
              Let&apos;s Go
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={handleSkip}
              disabled={saving}
              className="mt-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ── Goals ────────────────────────────────────────────────── */}
        {currentStep === 'goals' && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">What are your goals?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Select all that apply — this shapes your default rep ranges and progression targets.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {GOALS.map((goal) => {
                const selected = selectedGoals.includes(goal.id);
                const Icon = goal.icon;
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => toggleGoal(goal.id)}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-all duration-150',
                      selected
                        ? 'border-primary/40 bg-primary/10 scale-[1.02]'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]',
                    )}
                  >
                    <div className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
                      selected ? 'bg-primary/20' : 'bg-white/8',
                    )}>
                      <Icon className={cn('h-5 w-5', selected ? goal.color : 'text-muted-foreground')} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{goal.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{goal.description}</p>
                    </div>
                    {selected && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={prevStep} className="premium-button-secondary flex-1 justify-center">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={selectedGoals.length === 0}
                className="premium-button flex-1 justify-center disabled:opacity-40"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Experience ───────────────────────────────────────────── */}
        {currentStep === 'experience' && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">How experienced are you?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This affects how aggressively we suggest increasing weight.
              </p>
            </div>

            <div className="space-y-2.5">
              {EXPERIENCE_LEVELS.map((level) => {
                const selected = experienceLevel === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setExperienceLevel(level.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]',
                    )}
                  >
                    <div className={cn(
                      'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                      selected ? 'bg-primary/20 text-primary' : 'bg-white/8 text-muted-foreground',
                    )}>
                      <Target className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{level.label}</p>
                      <p className="text-sm text-muted-foreground">{level.description}</p>
                      {selected && (
                        <p className="mt-1.5 text-xs text-primary/80">{level.detail}</p>
                      )}
                    </div>
                    {selected && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={prevStep} className="premium-button-secondary flex-1 justify-center">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={!experienceLevel}
                className="premium-button flex-1 justify-center disabled:opacity-40"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Rep Range ────────────────────────────────────────────── */}
        {currentStep === 'reps' && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">Preferred rep range?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This sets your default target for compound lifts. The AI will build reps within this range before increasing weight.
              </p>
            </div>

            <div className="space-y-2.5">
              {REP_PRESETS.map((preset) => {
                const selected = selectedRepPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectRepPreset(preset.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]',
                    )}
                  >
                    <div className={cn(
                      'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-display transition-colors',
                      selected ? 'bg-primary/20 text-primary' : 'bg-white/8 text-muted-foreground',
                    )}>
                      <span className="text-base font-bold leading-none">{preset.range}</span>
                      <span className="text-[10px] font-medium">reps</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{preset.label}</p>
                      <p className="text-sm text-muted-foreground">{preset.description}</p>
                    </div>
                    {selected && (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom range */}
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Custom:</span>
              <input
                type="text"
                inputMode="numeric"
                value={repMin || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) { setRepMin(v); setSelectedRepPreset('custom'); }
                  else if (e.target.value === '') { setRepMin(0); }
                }}
                placeholder="Min"
                className="h-9 w-16 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-center text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/50"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <input
                type="text"
                inputMode="numeric"
                value={repMax || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) { setRepMax(v); setSelectedRepPreset('custom'); }
                  else if (e.target.value === '') { setRepMax(0); }
                }}
                placeholder="Max"
                className="h-9 w-16 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-center text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/50"
              />
              <span className="text-sm text-muted-foreground">reps</span>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={prevStep} className="premium-button-secondary flex-1 justify-center">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={repMin <= 0 || repMax <= 0 || repMax < repMin}
                className="premium-button flex-1 justify-center disabled:opacity-40"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Body Weight ──────────────────────────────────────────── */}
        {currentStep === 'body' && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">What&apos;s your body weight?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Used for relative strength tracking on bodyweight exercises. You can skip this.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/8 text-muted-foreground">
                <Scale className="h-5 w-5" />
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={bodyWeight}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setBodyWeight(v);
                }}
                placeholder="Body weight"
                className="h-12 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-lg font-medium text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              <div className="flex rounded-lg border border-white/10 bg-black/15 p-0.5">
                {(['kg', 'lb'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setWeightInputUnit(u)}
                    className={cn(
                      'h-10 min-w-[44px] rounded-md px-3 text-sm font-semibold transition-colors',
                      weightInputUnit === u
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={prevStep} className="premium-button-secondary flex-1 justify-center">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button onClick={nextStep} className="premium-button flex-1 justify-center">
                {bodyWeight.trim() ? 'Continue' : 'Skip'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Units ────────────────────────────────────────────────── */}
        {currentStep === 'units' && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">Preferred units?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Used across the app for weights and measurements. You can change this anytime in settings.
              </p>
            </div>

            <div className="space-y-2.5">
              {([
                { id: 'kg' as const, label: 'Kilograms (kg)', description: 'Metric — 2.5kg increments' },
                { id: 'lb' as const, label: 'Pounds (lb)', description: 'Imperial — 5lb increments' },
              ]).map((option) => {
                const selected = unitPreference === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setUnitPreference(option.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]',
                    )}
                  >
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-lg font-bold transition-colors',
                      selected ? 'bg-primary/20 text-primary' : 'bg-white/8 text-muted-foreground',
                    )}>
                      {option.id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                    {selected && (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={prevStep} className="premium-button-secondary flex-1 justify-center">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button onClick={nextStep} className="premium-button flex-1 justify-center">
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Summary ──────────────────────────────────────────────── */}
        {currentStep === 'summary' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[oklch(0.72_0.19_155/0.15)]">
                <Sparkles className="h-8 w-8 text-[oklch(0.78_0.17_155)]" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold">You&apos;re all set</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Here&apos;s your training profile. You can change any of this in Settings.
              </p>
            </div>

            <div className="space-y-2">
              {/* Goals */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Goals</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selectedGoals.map((g) => (
                    <span key={g} className="rounded-lg bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary">
                      {GOAL_LABELS[g] ?? g}
                    </span>
                  ))}
                  {selectedGoals.length === 0 && (
                    <span className="text-sm text-muted-foreground">None selected</span>
                  )}
                </div>
              </div>

              {/* Experience */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Experience</p>
                <p className="mt-0.5 text-sm font-semibold">{EXP_LABELS[experienceLevel] ?? 'Not set'}</p>
              </div>

              {/* Rep Range */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Preferred Rep Range</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {repMin > 0 && repMax > 0 ? `${repMin}–${repMax} reps` : 'Not set'}
                </p>
                <p className="text-xs text-muted-foreground">The AI will build reps in this range before increasing weight</p>
              </div>

              {/* Body + Units */}
              <div className="flex gap-2">
                <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Body Weight</p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {bodyWeight ? `${bodyWeight} ${weightInputUnit}` : '—'}
                  </p>
                </div>
                <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Units</p>
                  <p className="mt-0.5 text-sm font-semibold">{unitPreference === 'kg' ? 'Kilograms' : 'Pounds'}</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleFinish}
              disabled={saving}
              className="premium-button w-full justify-center text-base disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  Start Training
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Skip link (hidden on welcome and summary) */}
        {currentStep !== 'welcome' && currentStep !== 'summary' && (
          <div className="mt-5 text-center">
            <button
              onClick={handleSkip}
              disabled={saving}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
