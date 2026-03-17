'use client';

import { useState, useEffect } from 'react';
import {
  LogOut, Trash2, Download, Smartphone, User,
  ChevronRight, Loader2, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import { useUnitStore } from '@/store/unit-store';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { exportUserData } from '@/lib/export';
import { db } from '@/lib/offline/indexed-db';

const APP_VERSION = '0.1.0';

// ── Delete Account Dialog ─────────────────────────────────────────────────────

function DeleteAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep]       = useState<1 | 2>(1);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const signOut               = useAuthStore((s) => s.signOut);

  async function handleDelete() {
    setDeleting(true);
    try {
      const supabase = createClient();
      // Call Edge Function to purge all user data + delete auth user
      const { error } = await supabase.functions.invoke('delete-account', { body: {} });
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
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <>
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>all your data</strong> — workouts,
              templates, personal records, and your account. This cannot be undone.
            </p>
            <DialogFooter className="gap-2">
              <button
                onClick={handleClose}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex h-10 flex-1 items-center justify-center rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                Continue
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Type <strong>DELETE</strong> to confirm permanent account deletion.
            </p>
            <input
              autoFocus
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type DELETE"
              className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <DialogFooter className="gap-2">
              <button
                onClick={handleClose}
                disabled={deleting}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirm !== 'DELETE' || deleting}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
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

// ── Profile Page ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const user    = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { unit, setUnit } = useUnitStore();
  const { isInstallable, isInstalled, isDismissed, install } = usePwaInstall();

  const [displayName, setDisplayName]   = useState('');
  const [editingName, setEditingName]   = useState(false);
  const [savingName, setSavingName]     = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [failedCount, setFailedCount]   = useState(0);

  // Load display name from DB
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

  // Count failed sync queue items
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
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <h1 className="text-lg font-bold">Profile</h1>
      </header>

      <div className="px-4 pt-6 space-y-6">

        {/* ── Avatar + email ────────────────────────────────────── */}
        <section className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <User className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void saveDisplayName()}
                  placeholder="Your name"
                  className="h-9 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  onClick={() => void saveDisplayName()}
                  disabled={savingName}
                  className="flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="flex items-center gap-1.5 text-left"
              >
                <p className="text-base font-semibold">
                  {displayName || 'Add your name'}
                </p>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </section>

        {/* ── Unit toggle ───────────────────────────────────────── */}
        <SettingSection title="Preferences">
          <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Weight Unit</p>
              <p className="text-xs text-muted-foreground">Used throughout the app</p>
            </div>
            <div className="flex rounded-lg border border-border bg-muted p-0.5">
              {(['kg', 'lb'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => void handleUnitChange(u)}
                  className={`h-7 w-10 rounded-md text-xs font-semibold transition-colors ${
                    unit === u
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </SettingSection>

        {/* ── Data & app ────────────────────────────────────────── */}
        <SettingSection title="Data">
          <ActionRow
            icon={<Download className="h-4 w-4" />}
            label="Export Data"
            description="Download all your data as JSON"
            onClick={() => void handleExport()}
            loading={exporting}
          />

          {failedCount > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Sync Issues</p>
                <p className="text-xs text-muted-foreground">
                  {failedCount} mutation{failedCount !== 1 ? 's' : ''} failed to sync
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium">App Version</p>
            <p className="text-xs text-muted-foreground font-mono">{APP_VERSION}</p>
          </div>
        </SettingSection>

        {/* ── PWA Install ───────────────────────────────────────── */}
        {isInstallable && !isDismissed && !isInstalled && (
          <SettingSection title="Install">
            <ActionRow
              icon={<Smartphone className="h-4 w-4 text-primary" />}
              label="Add to Home Screen"
              description="Install LiftOS as an app for faster access"
              onClick={() => void install()}
              accent
            />
          </SettingSection>
        )}

        {isInstalled && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Smartphone className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-muted-foreground">App installed ✓</p>
          </div>
        )}

        {/* ── Account actions ───────────────────────────────────── */}
        <SettingSection title="Account">
          <ActionRow
            icon={<LogOut className="h-4 w-4" />}
            label="Sign Out"
            onClick={() => void handleSignOut()}
          />
          <ActionRow
            icon={<Trash2 className="h-4 w-4 text-destructive" />}
            label="Delete Account"
            description="Permanently erase all data"
            onClick={() => setDeleteOpen(true)}
            destructive
          />
        </SettingSection>
      </div>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
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
  icon: React.ReactNode;
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
      className={`flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted disabled:opacity-50 ${
        destructive ? 'text-destructive' : accent ? 'text-primary' : ''
      }`}
    >
      <span className="shrink-0">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}
