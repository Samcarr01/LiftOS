'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Loader2,
  LogOut,
  Pencil,
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
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground"
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

            {failedCount > 0 && (
              <SettingRow
                icon={<AlertTriangle className="h-4 w-4 text-[oklch(0.82_0.15_60)]" />}
                label="Sync issues"
                description={`${failedCount} change${failedCount !== 1 ? 's' : ''} failed to sync`}
              />
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
