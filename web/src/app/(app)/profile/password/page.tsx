'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';

export default function ChangePasswordPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = !busy && current.length > 0 && next.length >= 8 && confirm === next;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !user?.email) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (reauthError) {
        toast.error('Current password is incorrect');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      toast.success('Password updated');
      router.push('/profile');
    } catch (err) {
      toast.error((err as { message?: string }).message ?? 'Failed to update password');
    } finally {
      setBusy(false);
    }
  }

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

        <div>
          <h1 className="font-display text-2xl font-bold">Change password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;ll need your current password to confirm it&apos;s you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">New password</label>
            <div className="relative">
              <input
                type={showNext ? 'text' : 'password'}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/15 px-3 pr-10 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                aria-label={showNext ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {tooShort && <p className="text-xs text-destructive">Must be at least 8 characters.</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none focus:border-primary/50"
            />
            {mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="premium-button mt-2 w-full justify-center disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
