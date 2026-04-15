'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Dumbbell,
  KeyRound,
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
import { AvatarUploader } from '@/components/ui/avatar-uploader';

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

function formatMemberSince(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const { unit, setUnit } = useUnitStore();
  const { isInstallable, isInstalled, isDismissed, install } = usePwaInstall();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [workoutCount, setWorkoutCount] = useState<number | null>(null);
  const [setCount, setSetCount] = useState<number | null>(null);

  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from('users')
      .select('display_name, avatar_url, created_at')
      .single()
      .then(({ data }) => {
        const row = data as { display_name: string | null; avatar_url: string | null; created_at: string | null } | null;
        setDisplayName(row?.display_name ?? '');
        setAvatarUrl(row?.avatar_url ?? null);
        setMemberSince(row?.created_at ?? user.created_at ?? null);
      });

    void Promise.all([
      supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).not('completed_at', 'is', null),
      supabase.from('set_entries').select('id', { count: 'exact', head: true }),
    ]).then(([sessions, sets]) => {
      setWorkoutCount(sessions.count ?? 0);
      setSetCount(sets.count ?? 0);
    });
  }, [user]);

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

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <div className="page-header">
          <h1 className="page-header-title">Profile</h1>
        </div>

        {/* ── Compact hero ──────────────────────────────── */}
        <div className="content-card">
          {editingName ? (
            <div className="flex items-center gap-3">
              {user && (
                <AvatarUploader
                  userId={user.id}
                  displayName={displayName}
                  email={user.email ?? null}
                  avatarUrl={avatarUrl}
                  onChange={setAvatarUrl}
                  size={48}
                />
              )}
              <input
                autoFocus
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void saveDisplayName()}
                placeholder="Your name"
                className="h-9 flex-1 rounded-lg border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              <button
                onClick={() => void saveDisplayName()}
                disabled={savingName}
                className="flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {user && (
                <AvatarUploader
                  userId={user.id}
                  displayName={displayName}
                  email={user.email ?? null}
                  avatarUrl={avatarUrl}
                  onChange={setAvatarUrl}
                  size={48}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">{displayName || 'Add your name'}</p>
                  <button
                    onClick={() => setEditingName(true)}
                    aria-label="Edit display name"
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email}
                  {workoutCount !== null && setCount !== null && (
                    <> · {workoutCount} workout{workoutCount !== 1 ? 's' : ''} · {setCount} sets</>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Pending upload notice ─────────────────────── */}
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

        {/* ── Preferences ───────────────────────────────── */}
        <section>
          <h2 className="section-title mb-2">Preferences</h2>
          <div className="space-y-2">
            <LinkRow
              icon={<Dumbbell className="h-4 w-4" />}
              label="Training preferences"
              description="Goals, experience, rep range, body weight"
              onClick={() => router.push('/profile/training')}
            />
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
          </div>
        </section>

        {/* ── Account ───────────────────────────────────── */}
        <section>
          <h2 className="section-title mb-2">Account</h2>
          <div className="space-y-2">
            <LinkRow
              icon={<KeyRound className="h-4 w-4" />}
              label="Change password"
              onClick={() => router.push('/profile/password')}
            />
            <LinkRow
              icon={<LogOut className="h-4 w-4" />}
              label="Sign out"
              onClick={() => void handleSignOut()}
            />
          </div>
        </section>

        {/* ── Your data ─────────────────────────────────── */}
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

        {/* ── App ───────────────────────────────────────── */}
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

        {/* ── Danger zone ───────────────────────────────── */}
        <section>
          <h2 className="section-title mb-2">Danger zone</h2>
          <LinkRow
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete account"
            description="Permanently erase all data"
            onClick={() => setDeleteOpen(true)}
            destructive
          />
        </section>

        {memberSince && (
          <p className="pt-2 text-center text-xs text-muted-foreground/50">
            Member since {formatMemberSince(memberSince)}
          </p>
        )}
      </div>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}
