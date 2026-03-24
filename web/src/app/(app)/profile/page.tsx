'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  Loader2,
  LogOut,
  Pencil,
  Scale,
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
import { db } from '@/lib/offline/indexed-db';
import { clearFailed, getQueueSize, processQueue } from '@/lib/offline/sync-queue';

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

function SettingRow({
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

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const { unit, setUnit } = useUnitStore();
  const { isInstallable, isInstalled, isDismissed, install } = usePwaInstall();

  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Training preferences
  const [trainingGoals, setTrainingGoals] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [bodyWeight, setBodyWeight] = useState('');
  const [repMin, setRepMin] = useState('');
  const [repMax, setRepMax] = useState('');
  const [savingTraining, setSavingTraining] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('users')
      .select('display_name, training_goals, experience_level, body_weight_kg, preferred_rep_range')
      .single()
      .then(({ data }) => {
        const row = data as { display_name: string | null; training_goals: string[]; experience_level: string; body_weight_kg: number | null; preferred_rep_range: { min: number; max: number } | null } | null;
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
      });
  }, [user, unit]);

  useEffect(() => {
    getQueueSize().then(setPendingCount);
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

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <div className="page-header">
          <h1 className="page-header-title">Profile</h1>
        </div>

        {/* Name + email */}
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
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[oklch(0.75_0.18_55/0.12)] text-[oklch(0.80_0.16_55)] font-display text-lg font-bold">
                {(displayName || user?.email || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{displayName || 'Add your name'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <button
                onClick={() => setEditingName(true)}
                aria-label="Edit display name"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Preferences */}
        <section>
          <h2 className="section-title mb-2">Preferences</h2>
          <div className="list-row justify-between">
            <span className="text-sm font-semibold">Weight Unit</span>
            <div className="flex rounded-lg border border-white/10 bg-black/15 p-0.5">
              {(['kg', 'lb'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => void handleUnitChange(value)}
                  className={`h-7 min-w-[42px] rounded-md px-3 text-xs font-semibold transition-colors ${
                    unit === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Training */}
        <section>
          <h2 className="section-title mb-2">Training</h2>
          <div className="space-y-3">
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
                      onClick={() => setTrainingGoals((prev) =>
                        prev.includes(goal.id) ? prev.filter((g) => g !== goal.id) : [...prev, goal.id],
                      )}
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

            {/* Experience */}
            <div className="list-row justify-between">
              <span className="text-sm font-semibold">Experience</span>
              <div className="flex rounded-lg border border-white/10 bg-black/15 p-0.5">
                {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setExperienceLevel(level)}
                    className={`h-7 rounded-md px-2.5 text-xs font-semibold capitalize transition-colors ${
                      experienceLevel === level
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Rep Range */}
            <div className="list-row justify-between">
              <span className="text-sm font-semibold">Rep Range</span>
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

            {/* Body Weight */}
            <div className="list-row justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Body Weight</span>
              </div>
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

            {/* Save button */}
            <button
              onClick={async () => {
                setSavingTraining(true);
                try {
                  const supabase = createClient();
                  let bodyWeightKg: number | null = null;
                  if (bodyWeight.trim()) {
                    const parsed = parseFloat(bodyWeight);
                    if (!isNaN(parsed) && parsed > 0) {
                      bodyWeightKg = unit === 'lb' ? Math.round(parsed / 2.205 * 10) / 10 : parsed;
                    }
                  }
                  const parsedMin = parseInt(repMin);
                  const parsedMax = parseInt(repMax);
                  const preferredRepRange = !isNaN(parsedMin) && !isNaN(parsedMax) && parsedMin > 0 && parsedMax >= parsedMin
                    ? { min: parsedMin, max: parsedMax }
                    : null;

                  const { error } = await supabase.from('users').update({
                    training_goals: trainingGoals,
                    experience_level: experienceLevel,
                    body_weight_kg: bodyWeightKg,
                    preferred_rep_range: preferredRepRange,
                  }).eq('id', user!.id);
                  if (error) throw error;
                  toast.success('Training preferences saved');
                } catch {
                  toast.error('Failed to save preferences');
                } finally {
                  setSavingTraining(false);
                }
              }}
              disabled={savingTraining}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 text-sm font-semibold text-primary disabled:opacity-60"
            >
              {savingTraining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Training Preferences'}
            </button>
          </div>
        </section>

        {/* Data */}
        <section>
          <h2 className="section-title mb-2">Data</h2>
          <div className="space-y-2">
            <SettingRow
              icon={<Download className="h-4 w-4" />}
              label="Export Data"
              description="Download all data as JSON"
              onClick={() => void handleExport()}
              loading={exporting}
            />

            {pendingCount > 0 && (
              <div className="list-row flex-col items-stretch gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.75_0.16_60/0.12)] text-[oklch(0.82_0.15_60)]">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Pending sync</p>
                    <p className="text-sm text-muted-foreground">{pendingCount} change{pendingCount !== 1 ? 's' : ''} waiting to sync</p>
                  </div>
                </div>
                <div className="flex gap-2 pl-12">
                  <button
                    onClick={async () => {
                      toast.success('Syncing now...');
                      await processQueue();
                      const remaining = await getQueueSize();
                      setPendingCount(remaining);
                      if (remaining === 0) toast.success('All synced');
                      else toast.error(`${remaining} item${remaining !== 1 ? 's' : ''} still pending`);
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Sync Now
                  </button>
                  <button
                    onClick={async () => {
                      await clearFailed();
                      // Also clear any remaining pending items the user wants to discard
                      await db.syncQueue.clear();
                      setPendingCount(0);
                      toast.success('Queue cleared');
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Discard All
                  </button>
                </div>
              </div>
            )}

            <SettingRow
              icon={<span className="text-xs font-mono">{APP_VERSION}</span>}
              label="App Version"
            />
          </div>
        </section>

        {/* Install */}
        {(isInstallable && !isDismissed && !isInstalled) && (
          <section>
            <h2 className="section-title mb-2">Install</h2>
            <SettingRow
              icon={<Smartphone className="h-4 w-4" />}
              label="Add To Home Screen"
              description="Install as a PWA for faster access"
              onClick={() => void install()}
            />
          </section>
        )}

        {isInstalled && (
          <section>
            <h2 className="section-title mb-2">Install</h2>
            <SettingRow
              icon={<Smartphone className="h-4 w-4" />}
              label="App installed"
              description="LiftOS is on your home screen"
            />
          </section>
        )}

        {/* Account */}
        <section>
          <h2 className="section-title mb-2">Account</h2>
          <div className="space-y-2">
            <SettingRow
              icon={<LogOut className="h-4 w-4" />}
              label="Sign Out"
              onClick={() => void handleSignOut()}
            />
            <SettingRow
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete Account"
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
