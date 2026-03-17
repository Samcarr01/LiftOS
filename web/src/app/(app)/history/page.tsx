'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell, ChevronRight, Loader2 } from 'lucide-react';
import { useHistory } from '@/hooks/use-history';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMonthGroup, formatShortDate } from '@/lib/format-date';
import type { HistorySessionSummary } from '@/types/app';

/** Group sessions by "Month Year" key */
function groupByMonth(sessions: HistorySessionSummary[]): [string, HistorySessionSummary[]][] {
  const map = new Map<string, HistorySessionSummary[]>();
  for (const s of sessions) {
    const key = formatMonthGroup(s.started_at);
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

export default function HistoryPage() {
  const { sessions, loading, hasMore, refresh, loadMore } = useHistory();
  const router = useRouter();

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = groupByMonth(sessions);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <h1 className="text-lg font-bold">History</h1>
      </header>

      <div className="px-4 pt-4">
        {/* Loading skeleton */}
        {loading && sessions.length === 0 && (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No workouts yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Finish a workout to see it here.</p>
          </div>
        )}

        {/* Groups */}
        {groups.map(([month, items]) => (
          <section key={month} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {month}
            </h2>
            <div className="space-y-2">
              {items.map((s) => (
                <SessionRow key={s.id} session={s} onClick={() => router.push(`/history/${s.id}`)} />
              ))}
            </div>
          </section>
        ))}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
              : 'Load more'
            }
          </button>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  onClick,
}: {
  session: HistorySessionSummary;
  onClick: () => void;
}) {
  const name = session.template_name ?? 'Logged Workout';
  const date = formatShortDate(session.started_at);

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted active:bg-muted transition-colors"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <Dumbbell className="h-4 w-4 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {date}
          {session.exercise_count > 0 && <> · {session.exercise_count} exercises</>}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}
