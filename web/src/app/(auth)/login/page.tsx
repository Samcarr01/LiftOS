'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth-store';

type Mode = 'signin' | 'signup' | 'forgot';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithGoogle, signInWithEmail, signUp, resetPassword } = useAuthStore();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email.trim());
        if (error) {
          toast.error(error);
          return;
        }
        toast.success('Password reset email sent. Check your inbox.');
        setMode('signin');
        return;
      }

      if (mode === 'signup') {
        const { error } = await signUp(email.trim(), password);
        if (error) {
          toast.error(error);
          return;
        }
        toast.success('Account created. Check your email before signing in.', { duration: 6000 });
        setMode('signin');
        return;
      }

      const { error } = await signInWithEmail(email.trim(), password);
      if (error) {
        toast.error(error);
        return;
      }
      router.replace('/');
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = mode === 'forgot' ? 'Reset your password' : mode === 'signup' ? 'Create your account' : 'Sign in to LiftOS';
  const subtitle = mode === 'forgot'
    ? 'Enter your email and we will send a reset link.'
    : mode === 'signup'
      ? 'Start tracking your own workouts with a cleaner, simpler flow.'
      : 'Keep training simple and log the workouts you actually do.';
  const buttonLabel = mode === 'forgot' ? 'Send Reset Email' : mode === 'signup' ? 'Create Account' : 'Sign In';

  return (
    <div className="w-full max-w-md premium-card px-6 py-7 sm:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-primary/14 text-primary shadow-[0_24px_60px_-30px_rgba(91,163,255,0.8)]">
          <Zap className="h-6 w-6" />
        </div>
        <div>
          <p className="hero-kicker">LiftOS</p>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>

      {mode !== 'forgot' && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="premium-button-secondary mt-6 w-full justify-center disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Continue With Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-12 rounded-2xl border-white/10 bg-black/15"
          />
        </div>

        {mode !== 'forgot' && (
          <div className="space-y-2">
            <label htmlFor="password" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="h-12 rounded-2xl border-white/10 bg-black/15 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
          className="premium-button mt-2 w-full justify-center disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {buttonLabel}
        </button>
      </form>

      <div className="mt-6 space-y-3 text-center text-sm">
        {mode === 'signin' && (
          <>
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Forgot password?
            </button>
            <p className="text-muted-foreground">
              No account yet?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-semibold text-primary hover:underline"
              >
                Create one
              </button>
            </p>
          </>
        )}

        {mode === 'signup' && (
          <p className="text-muted-foreground">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="font-semibold text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        )}

        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(91,163,255,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(38,208,124,0.12),transparent_30%)]" />
      <div className="page-content relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="page-reveal hidden lg:block">
          <span className="hero-kicker">Premium Athletic Logging</span>
          <h2 className="mt-4 font-display text-6xl font-semibold leading-none text-foreground">
            The gym tracker should feel sharper than a spreadsheet.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            LiftOS is built to keep your workouts clear: create your own exercises, log the sessions you actually run, and get next-time guidance without the clutter.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="glass-panel px-5 py-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Clarity first</p>
              <p className="mt-2 font-display text-2xl font-semibold">Own exercises, simple logging, better scanability</p>
            </div>
            <div className="glass-panel px-5 py-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Guided progression</p>
              <p className="mt-2 font-display text-2xl font-semibold">Smarter next-time targets without overcomplication</p>
            </div>
          </div>
        </section>

        <div className="page-reveal delay-2">
          <Suspense
            fallback={
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.16em] text-muted-foreground backdrop-blur md:flex">
        <Sparkles className="h-3.5 w-3.5" />
        LiftOS Web App
      </div>
    </div>
  );
}

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
