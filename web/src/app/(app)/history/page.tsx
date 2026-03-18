'use client';

import { useEffect } from 'react';
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
      className="list-row w-full"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Calendar className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {formatShortDate(session.started_at)} · {session.exercise_count} ex · {session.total_sets} set{session.total_sets !== 1 ? 's' : ''}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

export default function HistoryPage() {
  const { sessions, loading, hasMore, refresh, loadMore } = useHistory();
  const router = useRouter();

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = groupByMonth(sessions);

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <div className="page-header">
          <h1 className="page-header-title">History</h1>
        </div>

        {loading && sessions.length === 0 && (
          <div className="space-y-2">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="content-card py-10 text-center">
            <Dumbbell className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">No workouts logged yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Finish a workout and it will show up here.
            </p>
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
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
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
