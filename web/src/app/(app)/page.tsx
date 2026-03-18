'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  ChevronRight,
  Dumbbell,
  Loader2,
  Play,
  Plus,
  Settings,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplates, type TemplateWithCount } from '@/hooks/use-templates';
import { useStartWorkout } from '@/hooks/use-start-workout';
import { useHomeData } from '@/hooks/use-home-data';
import { formatShortDate } from '@/lib/format-date';

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
      <SheetContent side="bottom" className="flex h-[70dvh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-[rgba(10,18,34,0.98)] p-0">
        <SheetHeader className="shrink-0 border-b border-white/8 px-5 pb-4 pt-5 text-left">
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
                  className="list-row w-full disabled:opacity-60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/14 text-primary">
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
                  <Play className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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

  const lastSession = data?.recentSessions?.[0] ?? null;
  const allTemplates = [...(data?.pinned ?? []), ...(data?.suggested ? [data.suggested] : [])];

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        {/* Greeting + settings */}
        <div className="page-header">
          {loading
            ? <Skeleton className="h-7 w-44 rounded-lg" />
            : <h1 className="page-header-title">{greeting(data?.displayName ?? null)}</h1>}
          <Link href="/profile" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/6 hover:text-foreground">
            <Settings className="h-5 w-5" />
          </Link>
        </div>

        {/* Start Workout CTA */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-left text-primary-foreground shadow-[0_8px_20px_-8px_rgba(91,163,255,0.5)] active:brightness-90"
        >
          <Play className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Start Workout</p>
            {data?.suggested && (
              <p className="truncate text-xs opacity-80">{data.suggested.name}</p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 opacity-60" />
        </button>

        {/* Last Session */}
        {loading ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : lastSession ? (
          <button
            onClick={() => router.push(`/history/${lastSession.id}`)}
            className="content-card w-full text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Last Session</p>
            <p className="mt-1.5 font-display text-base font-semibold">{lastSession.template_name ?? 'Custom Workout'} <span className="font-normal text-muted-foreground">· {formatShortDate(lastSession.started_at)}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lastSession.exercise_count} exercise{lastSession.exercise_count !== 1 ? 's' : ''} · {lastSession.total_sets} set{lastSession.total_sets !== 1 ? 's' : ''}
            </p>
          </button>
        ) : !loading && allTemplates.length === 0 ? (
          <div className="content-card text-center py-6">
            <p className="text-sm font-semibold">No workouts yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create your first workout to get started.</p>
            <button
              onClick={() => router.push('/templates?create=1')}
              className="premium-button mt-3"
            >
              <Plus className="h-4 w-4" />
              Create Workout
            </button>
          </div>
        ) : null}

        {/* Your Workouts - compact chips */}
        {loading ? (
          <Skeleton className="h-16 w-full rounded-2xl" />
        ) : allTemplates.length > 0 ? (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="section-title">Your Workouts</h2>
              <Link href="/templates" className="text-xs font-semibold text-primary">View all</Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {allTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => void handleQuickStart(template.id)}
                  disabled={starting !== null}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-card/82 px-3 py-2.5 text-left disabled:opacity-60"
                >
                  {starting === template.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    : <Dumbbell className="h-3.5 w-3.5 text-primary" />}
                  <span className="whitespace-nowrap text-sm font-semibold">{template.name}</span>
                </button>
              ))}
              <button
                onClick={() => router.push('/templates?create=1')}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap text-sm">New</span>
              </button>
            </div>
          </section>
        ) : null}

        {/* Recent Activity */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
          </div>
        ) : (data?.recentSessions ?? []).length > 0 ? (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="section-title">Recent Activity</h2>
              <Link href="/history" className="text-xs font-semibold text-primary">View all</Link>
            </div>
            <div className="space-y-2">
              {data!.recentSessions.slice(0, 3).map((session) => (
                <button
                  key={session.id}
                  onClick={() => router.push(`/history/${session.id}`)}
                  className="list-row w-full"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/6 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{session.template_name ?? 'Custom Workout'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatShortDate(session.started_at)} · {session.exercise_count} ex · {session.total_sets} sets
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <StartWorkoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreateWorkout={() => router.push('/templates?create=1')}
      />
    </div>
  );
}
