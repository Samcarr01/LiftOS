'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  Loader2,
  HelpCircle,
  LogOut,
  Pencil,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { invokeAuthedFunction } from '@/lib/supabase/invoke-authed-function';
import { useAuthStore } from '@/store/auth-store';
import { useUnitStore } from '@/store/unit-store';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { exportUserData } from '@/lib/export';
import { getQueueSize, processQueue } from '@/lib/offline/sync-queue';

const APP_VERSION = '0.1.0';

function DeleteAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const signOut = useAuthStore((state) => state.signOut);

  async function handleDelete() {
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await invokeAuthedFunction(supabase, 'delete-account', {});
      if (error) throw error;
      await signOut();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to delete account');
      setDeleting(false);
    }
  }

  function handleClose() {
    if (deleting) return;
    setStep(1);
    setConfirm('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
      <DialogContent className="sm:max-w-md border-white/[0.07] bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <>
            <p className="text-sm text-muted-foreground">
              This permanently deletes all data. There is no undo.
            </p>
            <DialogFooter className="gap-2 sm:justify-start">
              <button onClick={handleClose} className="premium-button-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex h-10 flex-1 items-center justify-center rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground"
              >
                Continue
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Type <strong className="text-foreground">DELETE</strong> to confirm.
            </p>
            <input
              autoFocus
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Type DELETE"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
            />
            <DialogFooter className="gap-2 sm:justify-start">
              <button
                onClick={handleClose}
                disabled={deleting}
                className="premium-button-secondary flex-1 justify-center disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirm !== 'DELETE' || deleting}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete Forever
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LinkRow({
  icon,
  label,
  description,
  onClick,
  loading,
  destructive,
  right,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  loading?: boolean;
  destructive?: boolean;
  right?: ReactNode;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      disabled={loading}
      className={`list-row w-full ${destructive ? 'text-destructive' : ''}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
        destructive ? 'bg-[oklch(0.65_0.20_25/0.12)] text-[oklch(0.72_0.18_25)]' : 'bg-white/6 text-muted-foreground'
      }`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold">{label}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {right ?? (onClick && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />)}
    </Wrapper>
  );
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

function formatMemberSince(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const { unit, setUnit } = useUnitStore();
  const { isInstallable, isInstalled, isDismissed, install } = usePwaInstall();

  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const [trainingGoals, setTrainingGoals] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [bodyWeight, setBodyWeight] = useState('');
  const [repMin, setRepMin] = useState('');
  const [repMax, setRepMax] = useState('');
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [workoutCount, setWorkoutCount] = useState<number | null>(null);
  const [setCount, setSetCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from('users')
      .select('display_name, training_goals, experience_level, body_weight_kg, preferred_rep_range, created_at')
      .single()
      .then(({ data }) => {
        const row = data as {
          display_name: string | null;
          training_goals: string[];
          experience_level: string;
          body_weight_kg: number | null;
          preferred_rep_range: { min: number; max: number } | null;
          created_at: string | null;
        } | null;
        setDisplayName(row?.display_name ?? '');
        setTrainingGoals(row?.training_goals ?? []);
        setExperienceLevel((row?.experience_level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate');
        if (row?.body_weight_kg) {
          setBodyWeight(unit === 'lb' ? String(Math.round(row.body_weight_kg * 2.205)) : String(row.body_weight_kg));
        }
        if (row?.preferred_rep_range) {
          setRepMin(String(row.preferred_rep_range.min));
          setRepMax(String(row.preferred_rep_range.max));
        }
        setMemberSince(row?.created_at ?? user.created_at ?? null);
        setPrefsLoaded(true);
      });

    void Promise.all([
      supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('set_entries').select('id', { count: 'exact', head: true }),
    ]).then(([sessions, sets]) => {
      setWorkoutCount(sessions.count ?? 0);
      setSetCount(sets.count ?? 0);
    });
  }, [user, unit]);

  useEffect(() => {
    void getQueueSize().then(setPendingCount);
  }, []);

  async function saveDisplayName() {
    if (!user) return;
    setSavingName(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to save name');
    } else {
      toast.success('Name updated');
      setEditingName(false);
    }
    setSavingName(false);
  }

  async function handleUnitChange(newUnit: 'kg' | 'lb') {
    setUnit(newUnit);
    if (!user) return;
    const supabase = createClient();
    await supabase
      .from('users')
      .update({ unit_preference: newUnit })
      .eq('id', user.id);
  }

  // Auto-save training preferences (debounced)
  useDebouncedEffect(
    () => {
      if (!user || !prefsLoaded) return;
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
          training_goals: trainingGoals,
          experience_level: experienceLevel,
          body_weight_kg: bodyWeightKg,
          preferred_rep_range: preferredRepRange,
        })
        .eq('id', user.id)
        .then(({ error }) => {
          if (!error) {
            setPrefsSaved(true);
            setTimeout(() => setPrefsSaved(false), 1500);
          }
        });
    },
    [trainingGoals, experienceLevel, bodyWeight, repMin, repMax],
    600,
  );

  async function handleExport() {
    setExporting(true);
    try {
      await exportUserData();
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleRetrySync() {
    setSyncing(true);
    try {
      await processQueue();
      const remaining = await getQueueSize();
      setPendingCount(remaining);
      if (remaining === 0) toast.success('All uploaded');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  const initial = (displayName || user?.email || '?')[0].toUpperCase();

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-6">
        <div className="page-header">
          <h1 className="page-header-title">Profile</h1>
        </div>

        {/* ── Hero identity ─────────────────────────────── */}
        <div className="content-card">
          {editingName ? (
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                autoFocus
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void saveDisplayName()}
                placeholder="Your name"
                className="h-10 flex-1 rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void saveDisplayName()}
                  disabled={savingName}
                  className="flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[oklch(0.75_0.18_55/0.12)] text-[oklch(0.80_0.16_55)] font-display text-2xl font-bold">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-center gap-1.5">
                  <p className="truncate text-base font-semibold">{displayName || 'Add your name'}</p>
                  <button
                    onClick={() => setEditingName(true)}
                    aria-label="Edit display name"
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
                {memberSince && (
                  <p className="mt-0.5 text-xs text-muted-foreground/60">Member since {formatMemberSince(memberSince)}</p>
                )}
              </div>

              {/* Stats strip */}
              {(workoutCount !== null || setCount !== null) && (
                <div className="mt-2 grid w-full grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center">
                    <p className="font-display text-lg font-bold">{workoutCount ?? '—'}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Workouts</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center">
                    <p className="font-display text-lg font-bold">{setCount ?? '—'}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sets logged</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Pending upload notice (only if queue has items) ── */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.06)] px-3.5 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.75_0.16_60/0.15)] text-[oklch(0.82_0.15_60)]">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {pendingCount} change{pendingCount !== 1 ? 's' : ''} still uploading
              </p>
              <p className="text-xs text-muted-foreground">We&apos;ll keep trying in the background.</p>
            </div>
            <button
              onClick={() => void handleRetrySync()}
              disabled={syncing}
              className="text-xs font-semibold text-primary disabled:opacity-60"
            >
              Retry now
            </button>
          </div>
        )}

        {/* ── Training preferences (auto-save) ─────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">Training</h2>
            {prefsSaved && (
              <span className="flex items-center gap-1 text-[11px] text-[oklch(0.72_0.19_155)]">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
          </div>

          <div className="space-y-2">
            {/* Units */}
            <div className="list-row justify-between">
              <span className="text-sm font-semibold">Weight unit</span>
              <div className="flex rounded-lg border border-white/10 bg-black/15 p-0.5">
                {(['kg', 'lb'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => void handleUnitChange(value)}
                    className={`h-7 min-w-[42px] rounded-md px-3 text-xs font-semibold transition-colors ${
                      unit === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div className="list-row justify-between">
              <span className="text-sm font-semibold">Experience</span>
              <div className="flex rounded-lg border border-white/10 bg-black/15 p-0.5">
                {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setExperienceLevel(level)}
                    className={`h-7 rounded-md px-2.5 text-xs font-semibold capitalize transition-colors ${
                      experienceLevel === level ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Rep range */}
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

            {/* Body weight */}
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

            {/* Goals */}
            <div className="list-row flex-col items-stretch gap-2">
              <span className="text-sm font-semibold">Goals</span>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'strength', label: 'Strength' },
                  { id: 'muscle', label: 'Muscle' },
                  { id: 'fat_loss', label: 'Fat Loss' },
                  { id: 'endurance', label: 'Endurance' },
                  { id: 'athletic', label: 'Athletic' },
                  { id: 'health', label: 'Health' },
                ] as const).map((goal) => {
                  const selected = trainingGoals.includes(goal.id);
                  return (
                    <button
                      key={goal.id}
                      onClick={() =>
                        setTrainingGoals((prev) =>
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
        </section>

        {/* ── Data ─────────────────────────────────────── */}
        <section>
          <h2 className="section-title mb-2">Your data</h2>
          <LinkRow
            icon={<Download className="h-4 w-4" />}
            label="Export all data"
            description="Download everything as JSON"
            onClick={() => void handleExport()}
            loading={exporting}
          />
        </section>

        {/* ── App ──────────────────────────────────────── */}
        <section>
          <h2 className="section-title mb-2">App</h2>
          <div className="space-y-2">
            <LinkRow
              icon={<HelpCircle className="h-4 w-4" />}
              label="Help & Getting Started"
              description="Tutorials, guides, and FAQ"
              onClick={() => router.push('/help')}
            />
            {isInstallable && !isDismissed && !isInstalled && (
              <LinkRow
                icon={<Smartphone className="h-4 w-4" />}
                label="Add to Home Screen"
                description="Install as a PWA for faster access"
                onClick={() => void install()}
              />
            )}
            {isInstalled && (
              <LinkRow
                icon={<Smartphone className="h-4 w-4" />}
                label="App installed"
                description="LiftOS is on your home screen"
              />
            )}
            <div className="list-row justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="font-mono text-xs text-muted-foreground/70">{APP_VERSION}</span>
            </div>
          </div>
        </section>

        {/* ── Account ──────────────────────────────────── */}
        <section>
          <h2 className="section-title mb-2">Account</h2>
          <div className="space-y-2">
            <LinkRow
              icon={<LogOut className="h-4 w-4" />}
              label="Sign out"
              onClick={() => void handleSignOut()}
            />
            <LinkRow
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete account"
              description="Permanently erase all data"
              onClick={() => setDeleteOpen(true)}
              destructive
            />
          </div>
        </section>
      </div>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}
