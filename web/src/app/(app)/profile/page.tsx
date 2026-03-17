'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Loader2,
  LogOut,
  Smartphone,
  Trash2,
  User,
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
      <DialogContent className="sm:max-w-md border-white/10 bg-[linear-gradient(180deg,rgba(10,18,34,0.98),rgba(10,18,34,0.94))] text-foreground shadow-[0_40px_100px_-50px_rgba(2,10,28,1)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This permanently deletes all workouts, templates, exercise data, records, and your account. There is no undo for this action.
            </p>
            <DialogFooter className="gap-2 sm:justify-start">
              <button onClick={handleClose} className="premium-button-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                Continue
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Type <strong className="text-foreground">DELETE</strong> to confirm permanent account deletion.
            </p>
            <input
              autoFocus
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Type DELETE"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/15 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
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
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
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

function SettingSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="section-shell">
      <div className="section-heading">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/75">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onClick,
  loading,
  destructive,
  accent,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  loading?: boolean;
  destructive?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`elevated-surface page-reveal flex w-full items-center gap-4 px-4 py-4 text-left disabled:opacity-60 ${
        destructive ? 'text-destructive' : accent ? 'text-primary' : ''
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
        destructive
          ? 'bg-destructive/12 text-destructive'
          : accent
            ? 'bg-primary/14 text-primary'
            : 'bg-white/6 text-foreground'
      }`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold">{label}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
    </button>
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
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('users')
      .select('display_name')
      .single()
      .then(({ data }) => {
        setDisplayName((data as { display_name: string | null } | null)?.display_name ?? '');
      });
  }, [user]);

  useEffect(() => {
    db.syncQueue.where('status').equals('failed').count().then(setFailedCount);
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
      <div className="page-content py-5 md:py-7">
        <section className="page-hero">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] bg-primary/14 text-primary shadow-[0_28px_70px_-38px_rgba(91,163,255,0.7)]">
              <User className="h-9 w-9" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="hero-kicker">Profile</span>
              {editingName ? (
                <div className="mt-4 flex flex-col gap-3 md:flex-row">
                  <input
                    autoFocus
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void saveDisplayName()}
                    placeholder="Your name"
                    className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/15 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveDisplayName()}
                      disabled={savingName}
                      className="premium-button px-4 disabled:opacity-60"
                    >
                      {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="premium-button-secondary px-4"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditingName(true)} className="mt-4 text-left">
                  <h1 className="page-title">{displayName || 'Add your name'}</h1>
                </button>
              )}
              <p className="page-subtitle mt-3">{user?.email}</p>
            </div>
          </div>
        </section>

        <div className="mt-8 space-y-8">
          <SettingSection title="Preferences" subtitle="local app settings">
            <div className="premium-card page-reveal px-5 py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-display text-xl font-semibold">Weight Unit</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Used across workouts, history, and progress.</p>
                </div>
                <div className="flex rounded-2xl border border-white/10 bg-black/15 p-1">
                  {(['kg', 'lb'] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => void handleUnitChange(value)}
                      className={`h-10 min-w-[58px] rounded-xl px-4 text-sm font-semibold transition-colors ${
                        unit === value
                          ? 'bg-primary text-primary-foreground shadow-[0_18px_36px_-24px_rgba(91,163,255,0.8)]'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SettingSection>

          <SettingSection title="Data" subtitle="exports and status">
            <ActionRow
              icon={<Download className="h-4 w-4" />}
              label="Export Data"
              description="Download all of your saved data as JSON."
              onClick={() => void handleExport()}
              loading={exporting}
            />

            {failedCount > 0 && (
              <div className="premium-card page-reveal px-5 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-500/12 text-yellow-300">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold">Sync issues detected</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {failedCount} queued change{failedCount !== 1 ? 's' : ''} failed to sync. The app will retry when possible.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="elevated-surface page-reveal flex items-center justify-between px-4 py-4">
              <div>
                <p className="font-display text-lg font-semibold">App Version</p>
                <p className="mt-1 text-sm text-muted-foreground">Current installed web build</p>
              </div>
              <span className="status-pill font-mono">{APP_VERSION}</span>
            </div>
          </SettingSection>

          {(isInstallable && !isDismissed && !isInstalled) && (
            <SettingSection title="Install" subtitle="pwa access">
              <ActionRow
                icon={<Smartphone className="h-4 w-4" />}
                label="Add To Home Screen"
                description="Install LiftOS as an app for faster access and a cleaner mobile feel."
                onClick={() => void install()}
                accent
              />
            </SettingSection>
          )}

          {isInstalled && (
            <SettingSection title="Install" subtitle="pwa access">
              <div className="premium-card page-reveal flex items-center gap-4 px-5 py-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold">App installed</h3>
                  <p className="mt-1 text-sm text-muted-foreground">LiftOS is already available from your home screen.</p>
                </div>
              </div>
            </SettingSection>
          )}

          <SettingSection title="Account" subtitle="session and security">
            <ActionRow
              icon={<LogOut className="h-4 w-4" />}
              label="Sign Out"
              description="End this session on the current device."
              onClick={() => void handleSignOut()}
            />
            <ActionRow
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete Account"
              description="Permanently erase all of your data."
              onClick={() => setDeleteOpen(true)}
              destructive
            />
          </SettingSection>
        </div>
      </div>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}
