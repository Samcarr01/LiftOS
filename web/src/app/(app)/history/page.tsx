'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronRight, Dumbbell, Loader2 } from 'lucide-react';
import { useHistory } from '@/hooks/use-history';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMonthGroup, formatShortDate } from '@/lib/format-date';
import type { HistorySessionSummary } from '@/types/app';

function groupByMonth(sessions: HistorySessionSummary[]): [string, HistorySessionSummary[]][] {
  const map = new Map<string, HistorySessionSummary[]>();
  for (const session of sessions) {
    const key = formatMonthGroup(session.started_at);
    const list = map.get(key) ?? [];
    list.push(session);
    map.set(key, list);
  }
  return Array.from(map.entries());
}

function SessionRow({
  session,
  onClick,
}: {
  session: HistorySessionSummary;
  onClick: () => void;
}) {
  const name = session.template_name ?? 'Custom Workout';

  return (
    <button
      onClick={onClick}
      className="action-card flex items-center gap-3 w-full text-left"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.75_0.18_55/0.12)] text-[oklch(0.80_0.16_55)]">
        <Calendar className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-card-title">{name}</p>
        <p className="text-sm text-muted-foreground">
          {formatShortDate(session.started_at)} · {session.exercise_count} ex · {session.total_sets} set{session.total_sets !== 1 ? 's' : ''}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

export default function HistoryPage() {
  const { sessions, loading, error, hasMore, refresh, loadMore } = useHistory();
  const router = useRouter();

  useEffect(() => {
    void refresh();

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupByMonth(sessions), [sessions]);

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <div className="page-header">
          <h1 className="page-header-title">History</h1>
        </div>

        {error && (
          <div className="content-card flex flex-col items-center gap-3 py-6 text-center" role="alert" aria-live="assertive">
            <p className="text-sm text-destructive">{error}</p>
            <button onClick={() => void refresh()} className="premium-button-secondary">
              Retry
            </button>
          </div>
        )}

        {loading && sessions.length === 0 && !error && (
          <div className="space-y-2">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="content-card flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Dumbbell className="h-6 w-6 text-primary" />
            </div>
            <p className="text-card-title">No workouts yet</p>
            <p className="text-sm text-muted-foreground">
              Finish a workout and it will show up here.
            </p>
            <a href="/" className="premium-button mt-1">Start your first workout</a>
          </div>
        )}

        {groups.map(([month, items], index) => (
          <section key={month}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="section-title">{month}</h2>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>

            <div className="space-y-2">
              {items.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onClick={() => router.push(`/history/${session.id}`)}
                />
              ))}
            </div>

            {index === groups.length - 1 && hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="mt-3 premium-button-secondary w-full justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading
                  </>
                ) : (
                  'Load More'
                )}
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
