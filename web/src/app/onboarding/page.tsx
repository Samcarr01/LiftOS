'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Dumbbell,
  Flame,
  Loader2,
  Scale,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useUnitStore } from '@/store/unit-store';

type Step = 'goals' | 'experience' | 'body' | 'units';

const GOALS = [
  { id: 'strength', label: 'Build Strength', description: 'Lift heavier weights', icon: Trophy },
  { id: 'muscle', label: 'Build Muscle', description: 'Grow size and definition', icon: Dumbbell },
  { id: 'fitness', label: 'Stay Fit', description: 'General health and endurance', icon: Flame },
] as const;

const EXPERIENCE_LEVELS = [
  { id: 'beginner', label: 'Just Starting', description: 'New to lifting or < 6 months' },
  { id: 'intermediate', label: 'Some Experience', description: '6 months to 2 years' },
  { id: 'advanced', label: 'Experienced', description: '2+ years of consistent training' },
] as const;

const STEPS: Step[] = ['goals', 'experience', 'body', 'units'];

export default function OnboardingPage() {
  const router = useRouter();
  const { setUnit } = useUnitStore();

  const [currentStep, setCurrentStep] = useState<Step>('goals');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [weightInputUnit, setWeightInputUnit] = useState<'kg' | 'lb'>('kg');
  const [unitPreference, setUnitPreference] = useState<'kg' | 'lb'>('kg');
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(currentStep);

  function toggleGoal(goalId: string) {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId],
    );
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

      // Convert body weight to kg for storage
      let bodyWeightKg: number | null = null;
      if (bodyWeight.trim()) {
        const parsed = parseFloat(bodyWeight);
        if (!isNaN(parsed) && parsed > 0) {
          bodyWeightKg = weightInputUnit === 'lb' ? Math.round(parsed / 2.205 * 10) / 10 : parsed;
        }
      }

      const { error } = await supabase.from('users').update({
        training_goals: selectedGoals,
        experience_level: (experienceLevel || 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
        body_weight_kg: bodyWeightKg,
        unit_preference: unitPreference,
        onboarding_completed: true,
      }).eq('id', (await supabase.auth.getUser()).data.user!.id);

      if (error) throw error;

      setUnit(unitPreference);
      router.replace('/');
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
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= stepIndex ? 'bg-primary' : 'bg-white/10',
              )}
            />
          ))}
        </div>

        {/* Step: Goals */}
        {currentStep === 'goals' && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">What are your goals?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Select all that apply. This helps tailor your progression targets.</p>
            </div>

            <div className="space-y-2.5">
              {GOALS.map((goal) => {
                const selected = selectedGoals.includes(goal.id);
                const Icon = goal.icon;
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => toggleGoal(goal.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]',
                    )}
                  >
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      selected ? 'bg-primary/20 text-primary' : 'bg-white/8 text-muted-foreground',
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{goal.label}</p>
                      <p className="text-sm text-muted-foreground">{goal.description}</p>
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

            <div className="flex gap-3">
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

        {/* Step: Experience */}
        {currentStep === 'experience' && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">How long have you been lifting?</h1>
              <p className="mt-1 text-sm text-muted-foreground">This affects how quickly we suggest increasing weight.</p>
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
                      'flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]',
                    )}
                  >
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      selected ? 'bg-primary/20 text-primary' : 'bg-white/8 text-muted-foreground',
                    )}>
                      <Target className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{level.label}</p>
                      <p className="text-sm text-muted-foreground">{level.description}</p>
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

            <div className="flex gap-3">
              <button onClick={prevStep} className="premium-button-secondary flex-1 justify-center">
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

        {/* Step: Body Weight */}
        {currentStep === 'body' && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">What&apos;s your body weight?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Used for bodyweight exercise tracking and relative strength. You can skip this.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/8 text-muted-foreground">
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
                        'h-9 min-w-[42px] rounded-md px-3 text-sm font-semibold transition-colors',
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
            </div>

            <div className="flex gap-3">
              <button onClick={prevStep} className="premium-button-secondary flex-1 justify-center">
                Back
              </button>
              <button onClick={nextStep} className="premium-button flex-1 justify-center">
                {bodyWeight.trim() ? 'Continue' : 'Skip'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Units */}
        {currentStep === 'units' && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">Preferred units?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Used across the app for weights and measurements.</p>
            </div>

            <div className="space-y-2.5">
              {([
                { id: 'kg', label: 'Kilograms (kg)', description: 'Metric system' },
                { id: 'lb', label: 'Pounds (lb)', description: 'Imperial system' },
              ] as const).map((option) => {
                const selected = unitPreference === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setUnitPreference(option.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]',
                    )}
                  >
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      selected ? 'bg-primary/20 text-primary' : 'bg-white/8 text-muted-foreground',
                    )}>
                      <Zap className="h-5 w-5" />
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

            <button
              onClick={handleFinish}
              disabled={saving}
              className="premium-button w-full justify-center disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get Started'}
            </button>
          </div>
        )}

        {/* Skip link */}
        <div className="mt-6 text-center">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
