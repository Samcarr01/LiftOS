'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  ChevronRight,
  Dumbbell,
  Flame,
  Library,
  Loader2,
  Plus,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplates, type TemplateWithCount } from '@/hooks/use-templates';
import { useStartWorkout } from '@/hooks/use-start-workout';
import { useHomeData } from '@/hooks/use-home-data';
import { formatShortDate } from '@/lib/format-date';
import type { HistorySessionSummary } from '@/types/app';

function greeting(name: string | null): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${time}, ${name.split(' ')[0]}` : `Good ${time}`;
}

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
      <SheetContent side="bottom" className="flex h-[84dvh] flex-col overflow-hidden rounded-t-[32px] border-t border-white/10 bg-[linear-gradient(180deg,rgba(10,18,34,0.98),rgba(10,18,34,0.93))] p-0 shadow-[0_-30px_80px_-40px_rgba(2,10,28,0.95)]">
        <SheetHeader className="shrink-0 border-b border-white/8 px-5 pb-4 pt-6 text-left">
          <span className="hero-kicker w-fit">Workout Launcher</span>
          <SheetTitle className="font-display pt-3 text-left text-2xl">Start a saved workout</SheetTitle>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Pick one of your saved sessions and jump straight into logging. The layout stays simple once the workout starts.
          </p>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="glass-panel animate-float-slow mb-4 px-4 py-4">
            <p className="text-sm font-semibold text-foreground">Built for repeat training</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Reuse the same workouts, log what you actually did, and let next-session targets update in the background.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="premium-card px-5 py-6 text-center">
              <p className="font-display text-xl font-semibold">No workouts saved yet</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Create your first workout with the exercises and tracking style you actually use.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onCreateWorkout();
                }}
                className="premium-button mt-5 w-full"
              >
                <Plus className="h-4 w-4" />
                Create Workout
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template, index) => (
                <button
                  key={template.id}
                  onClick={() => void handleStart(template.id)}
                  disabled={starting !== null}
                  className={`elevated-surface page-reveal delay-${Math.min(index + 1, 4)} flex w-full items-center gap-4 px-4 py-4 text-left disabled:opacity-60`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/14 shadow-[0_20px_36px_-22px_rgba(91,163,255,0.8)]">
                    {starting === template.id
                      ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      : <Dumbbell className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-semibold">{template.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
                      {template.last_used_at ? ` · Last used ${formatShortDate(template.last_used_at)}` : ' · Ready to log'}
                    </p>
                  </div>
                  <span className="status-pill border-primary/20 bg-primary/10 text-primary">Start</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuickAction({
  label,
  description,
  icon,
  onClick,
  primary,
  className = '',
}: {
  label: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`${primary ? 'premium-card bg-[linear-gradient(135deg,rgba(54,114,255,0.22),rgba(17,29,56,0.9))] shadow-[0_28px_60px_-30px_rgba(91,163,255,0.75)]' : 'quick-action-card'} page-reveal ${className}`}
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${primary ? 'bg-white/12 text-primary-foreground' : 'bg-primary/14 text-primary'}`}>
        {icon}
      </div>
      <div>
        <p className={`font-display text-lg font-semibold ${primary ? 'text-primary-foreground' : 'text-foreground'}`}>{label}</p>
        <p className={`mt-1 text-sm leading-relaxed ${primary ? 'text-primary-foreground/74' : 'text-muted-foreground'}`}>{description}</p>
      </div>
    </button>
  );
}

function FeaturedWorkoutCard({
  template,
  onStart,
  loading,
}: {
  template: TemplateWithCount;
  onStart: (id: string) => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={() => onStart(template.id)}
      disabled={loading}
      className="premium-card page-reveal delay-2 relative w-full overflow-hidden p-5 text-left transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="absolute inset-y-0 right-0 w-40 bg-[radial-gradient(circle_at_center,rgba(91,163,255,0.25),transparent_68%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="hero-kicker">Next workout</span>
          <h2 className="mt-4 font-display text-2xl font-semibold">{template.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
            {template.last_used_at ? ` · Last used ${formatShortDate(template.last_used_at)}` : ' · Fresh session'}
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary shadow-[0_18px_36px_-22px_rgba(91,163,255,0.8)]">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        </div>
      </div>
      <div className="relative mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
        Start this workout
        <ChevronRight className="h-4 w-4" />
      </div>
    </button>
  );
}

function SavedWorkoutCard({
  template,
  onStart,
  loading,
}: {
  template: TemplateWithCount;
  onStart: (id: string) => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={() => onStart(template.id)}
      disabled={loading}
      className="elevated-surface page-reveal delay-3 flex w-64 shrink-0 flex-col gap-4 p-4 text-left disabled:opacity-60"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dumbbell className="h-4 w-4" />}
        </div>
        <span className="status-pill">Saved</span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-semibold">{template.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
        </p>
      </div>
    </button>
  );
}

function RecentWorkoutRow({
  session,
  onClick,
}: {
  session: HistorySessionSummary;
  onClick: () => void;
}) {
  const preview = session.primary_result && session.primary_exercise_name
    ? `${session.primary_exercise_name} · ${session.primary_result}`
    : `${session.exercise_count} exercise${session.exercise_count !== 1 ? 's' : ''}`;

  return (
    <button
      onClick={onClick}
      className="elevated-surface page-reveal delay-4 flex w-full items-center gap-4 px-4 py-4 text-left"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary">
        <Calendar className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-semibold">{session.template_name ?? 'Custom Workout'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatShortDate(session.started_at)} · {session.total_sets} saved set{session.total_sets !== 1 ? 's' : ''}
        </p>
        <p className="mt-1 truncate text-xs uppercase tracking-[0.16em] text-muted-foreground/80">{preview}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/6 text-primary">
          {icon}
        </span>
        <h2 className="section-title">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const { data, loading } = useHomeData();
  const { startWorkout } = useStartWorkout();
  const router = useRouter();

  async function handleQuickStart(templateId: string) {
    setStarting(templateId);
    try {
      await startWorkout(templateId);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7">
        <section className="page-hero">
          <span className="hero-kicker">LiftOS</span>
          {loading
            ? <Skeleton className="mt-4 h-10 w-56 rounded-2xl" />
            : <h1 className="page-title mt-4">{greeting(data?.displayName ?? null)}</h1>}
          <p className="page-subtitle mt-3">
            Keep training simple. Start a saved workout, build a new one, or manage the exercises you actually use without getting lost in the interface.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
            <QuickAction
              label="Start Workout"
              description="Jump into one of your saved sessions and start logging."
              icon={<Zap className="h-5 w-5" />}
              onClick={() => setSheetOpen(true)}
              primary
            />
            <QuickAction
              label="Create Workout"
              description="Build a new workout around your own exercise names and structure."
              icon={<Plus className="h-5 w-5" />}
              onClick={() => router.push('/templates?create=1')}
              className="delay-2"
            />
            <QuickAction
              label="Your Exercises"
              description="Browse, rename, and clean up the exercise list you’ve built."
              icon={<Library className="h-5 w-5" />}
              onClick={() => router.push('/exercises')}
              className="delay-3"
            />
          </div>
        </section>

        <div className="mt-8 space-y-8">
          {!loading && !data?.suggested && (data?.pinned ?? []).length === 0 && (
            <section className="premium-card page-reveal delay-2 px-5 py-5">
              <span className="hero-kicker">First session</span>
              <h2 className="mt-4 font-display text-2xl font-semibold">Start with the workout you actually do</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Add the exercises you really use in the gym, choose the tracking style that makes sense, and keep the app focused on logging rather than setup.
              </p>
              <button
                onClick={() => router.push('/templates?create=1')}
                className="premium-button mt-5"
              >
                <Plus className="h-4 w-4" />
                Create Your First Workout
              </button>
            </section>
          )}

          {loading ? (
            <Skeleton className="h-56 w-full rounded-[28px]" />
          ) : data?.suggested ? (
            <section className="section-shell">
              <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="Featured Workout" />
              <FeaturedWorkoutCard
                template={data.suggested}
                onStart={handleQuickStart}
                loading={starting === data.suggested.id}
              />
            </section>
          ) : null}

          {loading ? (
            <div className="flex gap-3 overflow-hidden">
              <Skeleton className="h-44 w-64 shrink-0 rounded-[28px]" />
              <Skeleton className="h-44 w-64 shrink-0 rounded-[28px]" />
            </div>
          ) : (data?.pinned ?? []).length > 0 ? (
            <section className="section-shell">
              <SectionHeader icon={<Flame className="h-4 w-4" />} title="Saved Workouts" />
              <div className="flex gap-4 overflow-x-auto pb-1 no-scrollbar">
                {data!.pinned.map((template) => (
                  <SavedWorkoutCard
                    key={template.id}
                    template={template}
                    onStart={handleQuickStart}
                    loading={starting === template.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-[28px]" />
              <Skeleton className="h-24 w-full rounded-[28px]" />
            </div>
          ) : (data?.recentSessions ?? []).length > 0 ? (
            <section className="section-shell">
              <SectionHeader
                icon={<Calendar className="h-4 w-4" />}
                title="Recent Workouts"
                action={
                  <button
                    onClick={() => router.push('/history')}
                    className="premium-button-secondary py-2 text-xs"
                  >
                    View All
                  </button>
                }
              />
              <div className="space-y-3">
                {data!.recentSessions.map((session) => (
                  <RecentWorkoutRow
                    key={session.id}
                    session={session}
                    onClick={() => router.push(`/history/${session.id}`)}
                  />
                ))}
              </div>
            </section>
          ) : !loading ? (
            <div className="premium-card page-reveal delay-3 flex flex-col items-center gap-3 px-5 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/14 text-primary">
                <Dumbbell className="h-7 w-7" />
              </div>
              <h2 className="font-display text-2xl font-semibold">No workouts logged yet</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Once you complete a session, your history and progress snapshots will show up here.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <StartWorkoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreateWorkout={() => router.push('/templates?create=1')}
      />
    </div>
  );
}
