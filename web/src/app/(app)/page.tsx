'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  ChevronRight,
  Dumbbell,
  Flame,
  Loader2,
  Play,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplates, type TemplateWithCount } from '@/hooks/use-templates';
import { useStartWorkout } from '@/hooks/use-start-workout';
import { useHomeData } from '@/hooks/use-home-data';
import { formatShortDate, formatDistanceToNow } from '@/lib/format-date';
import { useTutorialStore } from '@/store/tutorial-store';
import GettingStartedTutorial from '@/components/tutorial/getting-started-tutorial';

/* ── Helpers ────────────────────────────────────────────────── */

function greeting(name: string | null): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${time}, ${name.split(' ')[0]}` : `Good ${time}`;
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function getThisWeekCount(sessions: { started_at: string }[]): number {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return sessions.filter((s) => new Date(s.started_at) >= monday).length;
}

function getWeekdayFlags(sessions: { started_at: string }[]): boolean[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const flags = [false, false, false, false, false, false, false];
  for (const s of sessions) {
    const d = new Date(s.started_at);
    if (d >= monday) {
      const idx = (d.getDay() + 6) % 7; // 0=Mon
      flags[idx] = true;
    }
  }
  return flags;
}

/* ── Start Workout Sheet ────────────────────────────────────── */

function StartWorkoutSheet({
  open,
  onClose,
  onCreateWorkout,
}: {
  open: boolean;
  onClose: () => void;
  onCreateWorkout: () => void;
}) {
  const { templates, isLoading } = useTemplates();
  const { startWorkout } = useStartWorkout();
  const [starting, setStarting] = useState<string | null>(null);

  async function handleStart(templateId: string) {
    setStarting(templateId);
    try {
      await startWorkout(templateId);
    } finally {
      setStarting(null);
      onClose();
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent side="bottom" className="flex h-[70dvh] flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.06] bg-white/[0.10] backdrop-blur-xl p-0">
        <SheetHeader className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-5 text-left">
          <SheetTitle className="font-display text-lg font-bold text-left">Choose a workout</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">No workouts saved yet.</p>
              <button
                onClick={() => { onClose(); onCreateWorkout(); }}
                className="premium-button"
              >
                <Plus className="h-4 w-4" />
                Create Workout
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => void handleStart(template.id)}
                  disabled={starting !== null}
                  className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.05] bg-white/[0.03] px-4 py-3.5 text-left transition-all duration-150 hover:border-white/[0.1] hover:bg-white/[0.08] active:scale-[0.995] disabled:opacity-60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.75_0.18_55/0.15)] text-primary">
                    {starting === template.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Dumbbell className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
                      {template.last_used_at ? ` · ${formatShortDate(template.last_used_at)}` : ''}
                    </p>
                  </div>
                  <Play className="h-4 w-4 shrink-0 text-primary opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Home Page ──────────────────────────────────────────────── */

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const { data, loading, refresh } = useHomeData();
  const { startWorkout } = useStartWorkout();
  const router = useRouter();
  const { hasSeenTutorial, markTutorialSeen } = useTutorialStore();
  const [showTutorial, setShowTutorial] = useState(false);

  // Show tutorial when arriving from onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tutorial') === '1' && !hasSeenTutorial) {
      setShowTutorial(true);
      window.history.replaceState({}, '', '/');
    }
  }, [hasSeenTutorial]);

  // Refetch when returning from workout or regaining focus
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refresh]);

  async function handleQuickStart(templateId: string) {
    setStarting(templateId);
    try {
      await startWorkout(templateId);
    } finally {
      setStarting(null);
    }
  }

  const lastSession = data?.recentSessions?.[0] ?? null;
  const allTemplates = [...(data?.pinned ?? []), ...(data?.suggested ?? [])];
  const thisWeekCount = data ? getThisWeekCount(data.recentSessions) : 0;

  return (
    <>
    {showTutorial && (
      <GettingStartedTutorial
        onComplete={() => {
          markTutorialSeen();
          setShowTutorial(false);
        }}
      />
    )}
    <div className="page-shell">
      <div className="page-content space-y-6 py-6 md:py-8">

        {/* ── Header ──────────────────────────────── */}
        <div className="page-reveal">
          {loading ? (
            <>
              <Skeleton className="h-8 w-48 rounded-lg" />
              <Skeleton className="mt-1.5 h-4 w-36 rounded-md" />
            </>
          ) : (
            <>
              <h1 className="page-header-title">{greeting(data?.displayName ?? null)}</h1>
              <p className="mt-0.5 text-caption">{formatToday()}</p>
            </>
          )}
        </div>

        {/* ── Start Workout CTA ──────────────────── */}
        <button
          onClick={() => setSheetOpen(true)}
          className="page-reveal delay-1 group relative w-full overflow-hidden rounded-2xl px-6 py-6 text-left text-primary-foreground shadow-[0_8px_32px_-8px_oklch(0.75_0.18_55/0.4)] transition-all duration-150 hover:shadow-[0_14px_40px_-8px_oklch(0.75_0.18_55/0.5)] active:scale-[0.99] active:brightness-95"
          style={{ background: 'linear-gradient(135deg, oklch(0.75 0.18 55), oklch(0.56 0.16 40))' }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.1),transparent_60%)]" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Play className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold tracking-tight">Start Workout</p>
              {data?.suggested?.[0] ? (
                <p className="mt-0.5 truncate text-sm text-white/80">
                  {data.suggested[0].name} · {data.suggested[0].exercise_count} exercise{data.suggested[0].exercise_count !== 1 ? 's' : ''}
                </p>
              ) : !loading ? (
                <p className="mt-0.5 text-sm text-white/80">Choose a template to begin</p>
              ) : null}
            </div>
            <ChevronRight className="h-5 w-5 opacity-50 transition-transform duration-150 group-hover:translate-x-0.5" />
          </div>
        </button>

        {/* ── Quick Stats ─────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-[76px] rounded-xl" />
            <Skeleton className="h-[76px] rounded-xl" />
          </div>
        ) : (data?.recentSessions?.length ?? 0) > 0 ? (
          <div className="page-reveal delay-2 grid grid-cols-2 gap-3">
            <div className="action-card flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.75_0.18_55/0.15)] text-[oklch(0.80_0.16_55)]">
                <Flame className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="font-display text-xl font-bold">{thisWeekCount}</p>
                <p className="text-caption">This week</p>
              </div>
            </div>
            {lastSession && (
              <button
                onClick={() => router.push(`/history/${lastSession.id}`)}
                className="action-card flex items-center gap-3 text-left transition-colors duration-150"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.72_0.19_155/0.15)] text-[oklch(0.78_0.17_155)]">
                  <TrendingUp className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{lastSession.template_name ?? 'Workout'}</p>
                  <p className="text-caption">{formatDistanceToNow(lastSession.started_at)}</p>
                </div>
              </button>
            )}
          </div>
        ) : null}

        {/* ── Weekly Activity Dots ─────────────────── */}
        {!loading && (data?.recentSessions?.length ?? 0) > 0 && (() => {
          const flags = getWeekdayFlags(data!.recentSessions);
          const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
          return (
            <div className="page-reveal delay-2 flex items-center justify-between gap-1 px-2">
              {days.map((label, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${flags[i] ? 'bg-primary' : 'bg-white/[0.08]'}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Progress Link ──────────────────────── */}
        {!loading && (data?.recentSessions?.length ?? 0) > 0 && (
          <Link
            href="/progress"
            className="page-reveal delay-2 action-card group flex items-center gap-3.5 rounded-2xl px-4 py-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.72_0.17_252/0.15)] text-[oklch(0.78_0.15_252)]">
              <BarChart3 className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Progress & Charts</p>
              <p className="text-caption">Track PRs, trends, and weekly summaries</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        )}

        {/* ── Your Workouts ───────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-[72px] w-full rounded-xl" />
            <Skeleton className="h-[72px] w-full rounded-xl" />
          </div>
        ) : allTemplates.length > 0 ? (
          <section className="page-reveal delay-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Your workouts</h2>
              <Link href="/templates" className="text-xs font-semibold text-primary hover:underline">View all</Link>
            </div>
            <div className="space-y-2.5">
              {allTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => void handleQuickStart(template.id)}
                  disabled={starting !== null}
                  className="action-card group flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left active:scale-[0.995] disabled:opacity-60"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.75_0.18_55/0.15)] text-primary">
                    {starting === template.id
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <Dumbbell className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-card-title">{template.name}</p>
                    <p className="mt-0.5 text-caption">
                      {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
                      {template.last_used_at ? ` · ${formatShortDate(template.last_used_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.75_0.18_55/0.15)] text-primary opacity-60 transition-opacity duration-150 group-hover:opacity-100">
                    <Play className="h-3.5 w-3.5" />
                  </div>
                </button>
              ))}
              <button
                onClick={() => router.push('/templates?create=1')}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.15] px-4 py-3.5 text-sm font-semibold text-muted-foreground transition-all duration-150 hover:border-white/[0.2] hover:bg-white/[0.03] hover:text-foreground active:scale-[0.995]"
              >
                <Plus className="h-4 w-4" />
                Create New Workout
              </button>

            </div>
          </section>
        ) : (
          <section className="page-reveal delay-2">
            <div className="content-card flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[oklch(0.75_0.18_55/0.15)] text-primary">
                <Dumbbell className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-base font-semibold">Create your first workout</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Build a template and start logging your training.
                </p>
              </div>
              <button
                onClick={() => router.push('/templates?create=1')}
                className="premium-button"
              >
                <Plus className="h-4 w-4" />
                Create Workout
              </button>
            </div>
          </section>
        )}

        {/* ── Recent Activity ─────────────────────── */}
        {!loading && (data?.recentSessions ?? []).length > 0 && (
          <section className="page-reveal delay-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Recent activity</h2>
              <Link href="/history" className="text-xs font-semibold text-primary hover:underline">View all</Link>
            </div>
            <div className="space-y-2.5">
              {data!.recentSessions.slice(0, 3).map((session) => (
                <button
                  key={session.id}
                  onClick={() => router.push(`/history/${session.id}`)}
                  className="action-card group flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.995]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.75_0.18_55/0.15)] text-primary/70">
                    <Calendar className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-semibold">{session.template_name ?? 'Custom Workout'}</p>
                      <span className="shrink-0 text-caption">{formatShortDate(session.started_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-caption">
                      {session.primary_exercise_name
                        ? `${session.primary_exercise_name}${session.primary_result ? ` · ${session.primary_result}` : ''}`
                        : `${session.exercise_count} exercise${session.exercise_count !== 1 ? 's' : ''} · ${session.total_sets} set${session.total_sets !== 1 ? 's' : ''}`
                      }
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <StartWorkoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreateWorkout={() => router.push('/templates?create=1')}
      />
    </div>
    </>
  );
}
