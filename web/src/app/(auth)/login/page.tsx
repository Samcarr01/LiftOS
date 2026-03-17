'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth-store';

type Mode = 'signin' | 'signup' | 'forgot';

// ── Inner form (uses useSearchParams, must be inside Suspense) ────────────────

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithGoogle, signInWithEmail, signUp, resetPassword } = useAuthStore();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Surface errors from OAuth callback redirect (?error=...)
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) toast.error(decodeURIComponent(error));
  }, [searchParams]);

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error(error);
      setIsSubmitting(false);
    }
    // On success the browser navigates away — no cleanup needed
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Email is required'); return; }

    setIsSubmitting(true);
    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email.trim());
        if (error) { toast.error(error); return; }
        toast.success('Password reset email sent — check your inbox.');
        setMode('signin');
        return;
      }

      if (mode === 'signup') {
        const { error } = await signUp(email.trim(), password);
        if (error) { toast.error(error); return; }
        toast.success(
          'Account created! Check your email to verify before signing in.',
          { duration: 6000 },
        );
        setMode('signin');
        return;
      }

      // Sign in
      const { error } = await signInWithEmail(email.trim(), password);
      if (error) { toast.error(error); return; }
      router.replace('/');
    } finally {
      setIsSubmitting(false);
    }
  }

  const title   = mode === 'forgot' ? 'Reset password'   : mode === 'signup' ? 'Create account' : 'Sign in';
  const btnText = mode === 'forgot' ? 'Send reset email' : mode === 'signup' ? 'Create account' : 'Sign in';

  return (
    <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Zap className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">LiftOS</h1>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>

      {/* Google button — signin / signup only */}
      {mode !== 'forgot' && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="relative flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {/* Email / password form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10"
          />
        </div>

        {mode !== 'forgot' && (
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {btnText}
        </button>
      </form>

      {/* Footer links */}
      <div className="space-y-2 text-center text-sm">
        {mode === 'signin' && (
          <>
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="block w-full text-muted-foreground hover:text-foreground transition-colors"
            >
              Forgot password?
            </button>
            <p className="text-muted-foreground">
              No account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </button>
            </p>
          </>
        )}

        {mode === 'signup' && (
          <p className="text-muted-foreground">
            Have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        )}

        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page (wraps form in Suspense for useSearchParams) ─────────────────────────

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Suspense
        fallback={
          <div className="flex h-12 w-12 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

// ── Google SVG logo ───────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
