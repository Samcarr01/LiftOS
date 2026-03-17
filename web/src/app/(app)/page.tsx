'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Plus, Dumbbell, Loader2, ChevronRight,
  Trophy, Calendar, Flame,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplates, type TemplateWithCount } from '@/hooks/use-templates';
import { useStartWorkout } from '@/hooks/use-start-workout';
import { useHomeData, type LastHighlight } from '@/hooks/use-home-data';
import { formatShortDate, formatDuration } from '@/lib/format-date';
import type { HistorySessionSummary } from '@/types/app';

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting(name: string | null): string {
  const h    = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${time}, ${name.split(' ')[0]}` : `Good ${time}`;
}

// ── Start Workout Sheet ───────────────────────────────────────────────────────

function StartWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { templates, isLoading } = useTemplates();
  const { startWorkout }         = useStartWorkout();
  const [starting, setStarting]  = useState<string | null>(null);

  async function handleStart(templateId: string | null) {
    const key = templateId ?? 'blank';
    setStarting(key);
    try {
      await startWorkout(templateId);
    } finally {
      setStarting(null);
      onClose();
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[80dvh] rounded-t-2xl p-0">
        <SheetHeader className="border-b border-border px-4 pb-3 pt-5">
          <SheetTitle>Start Workout</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto px-4 py-4 space-y-2">
          {/* Blank workout */}
          <button
            onClick={() => handleStart(null)}
            disabled={starting !== null}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3.5 text-left hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
          >
            {starting === 'blank'
              ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              : <Plus className="h-5 w-5 text-muted-foreground" />
            }
            <div>
              <p className="text-sm font-semibold">Blank Workout</p>
              <p className="text-xs text-muted-foreground">Start without a template</p>
            </div>
          </button>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No templates yet.
            </p>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleStart(t.id)}
                disabled={starting !== null}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left hover:bg-muted disabled:opacity-60"
              >
                {starting === t.id
                  ? <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
                  : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Dumbbell className="h-4 w-4 text-primary" />
                    </div>
                  )
                }
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.exercise_count} exercise{t.exercise_count !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SuggestedCard({
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
      className="w-full rounded-2xl bg-primary p-4 text-left text-primary-foreground hover:bg-primary/90 active:scale-[0.99] transition-transform disabled:opacity-60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70 mb-1">
            Suggested
          </p>
          <p className="truncate text-lg font-bold">{template.name}</p>
          <p className="mt-0.5 text-sm opacity-80">
            {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
            {!template.last_used_at && ' · Never done'}
          </p>
        </div>
        {loading
          ? <Loader2 className="h-5 w-5 shrink-0 animate-spin opacity-70" />
          : <Zap className="h-5 w-5 shrink-0 opacity-70" />
        }
      </div>
    </button>
  );
}

function PinnedCard({
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
      className="flex w-48 shrink-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted active:bg-muted/80 disabled:opacity-60"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Dumbbell className="h-4 w-4 text-primary" />}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{template.name}</p>
        <p className="text-xs text-muted-foreground">
          {template.exercise_count} ex.
          {template.last_used_at && ` · ${formatShortDate(template.last_used_at)}`}
        </p>
      </div>
    </button>
  );
}

function RecentRow({
  session,
  onClick,
}: {
  session: HistorySessionSummary;
  onClick: () => void;
}) {
  const name = session.template_name ?? 'Quick Workout';
  const date = formatShortDate(session.started_at);
  const dur  = session.duration_seconds ? formatDuration(session.duration_seconds) : null;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left hover:bg-muted active:bg-muted transition-colors"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Calendar className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {date}{dur && ` · ${dur}`}
          {session.total_sets > 0 && ` · ${session.total_sets} sets`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}

function HighlightRow({ highlight }: { highlight: LastHighlight }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="truncate text-sm font-medium">{highlight.exerciseName}</p>
      <span className="shrink-0 text-sm font-bold text-primary">{highlight.displayValue}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [starting, setStarting]   = useState<string | null>(null);
  const { data, loading }         = useHomeData();
  const { startWorkout }          = useStartWorkout();
  const router                    = useRouter();

  async function handleQuickStart(templateId: string) {
    setStarting(templateId);
    try {
      await startWorkout(templateId);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="px-4 pt-6 pb-4">
        {loading
          ? <Skeleton className="h-7 w-48" />
          : <h1 className="text-xl font-bold">{greeting(data?.displayName ?? null)}</h1>
        }
        <p className="mt-0.5 text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      <div className="px-4 space-y-6">

        {/* ── Start Workout FAB ──────────────────────────────────── */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-[0.98] transition-transform"
          style={{ height: '52px' }}
        >
          <Zap className="h-5 w-5" />
          Start Workout
        </button>

        {/* ── Suggested workout ──────────────────────────────────── */}
        {loading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : data?.suggested ? (
          <SuggestedCard
            template={data.suggested}
            onStart={handleQuickStart}
            loading={starting === data.suggested.id}
          />
        ) : null}

        {/* ── Pinned workouts ────────────────────────────────────── */}
        {loading ? (
          <div className="flex gap-3 overflow-hidden">
            <Skeleton className="h-28 w-48 shrink-0 rounded-2xl" />
            <Skeleton className="h-28 w-48 shrink-0 rounded-2xl" />
          </div>
        ) : (data?.pinned ?? []).length > 0 ? (
          <section>
            <SectionHeader icon={<Flame className="h-3.5 w-3.5" />} title="Pinned" />
            <div className="mt-2 flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {data!.pinned.map((t) => (
                <PinnedCard
                  key={t.id}
                  template={t}
                  onStart={handleQuickStart}
                  loading={starting === t.id}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Last session highlights ────────────────────────────── */}
        {!loading && (data?.lastHighlights ?? []).length > 0 && (
          <section>
            <SectionHeader icon={<Trophy className="h-3.5 w-3.5 text-yellow-500" />} title="Last Session" />
            <div className="mt-2 space-y-1.5">
              {data!.lastHighlights.map((h, i) => (
                <HighlightRow key={i} highlight={h} />
              ))}
            </div>
          </section>
        )}

        {/* ── Recent workouts ────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (data?.recentSessions ?? []).length > 0 ? (
          <section>
            <SectionHeader icon={<Calendar className="h-3.5 w-3.5" />} title="Recent Workouts" />
            <div className="mt-2 space-y-2">
              {data!.recentSessions.map((s) => (
                <RecentRow
                  key={s.id}
                  session={s}
                  onClick={() => router.push(`/history/${s.id}`)}
                />
              ))}
            </div>
          </section>
        ) : !loading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No workouts yet — start your first one above!</p>
          </div>
        ) : null}

      </div>

      <StartWorkoutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
    </div>
  );
}
