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
  const preview = session.primary_result && session.primary_exercise_name
    ? `${session.primary_exercise_name} · ${session.primary_result}`
    : `${session.exercise_count} exercise${session.exercise_count !== 1 ? 's' : ''} logged`;

  return (
    <button
      onClick={onClick}
      className="elevated-surface page-reveal flex w-full items-center gap-4 px-4 py-4 text-left transition-transform duration-300 hover:-translate-y-0.5"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary">
        <Calendar className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-semibold">{name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatShortDate(session.started_at)} · {session.exercise_count} exercise{session.exercise_count !== 1 ? 's' : ''} · {session.total_sets} saved set{session.total_sets !== 1 ? 's' : ''}
        </p>
        <p className="mt-1 truncate text-xs uppercase tracking-[0.16em] text-muted-foreground/80">{preview}</p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/55" />
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
      <div className="page-content py-5 md:py-7">
        <section className="page-hero">
          <span className="hero-kicker">History</span>
          <h1 className="page-title mt-4">See exactly what you have done</h1>
          <p className="page-subtitle mt-3">
            Every finished workout should be easy to scan. Open any session to see the date, the exercises you logged, and the sets you completed without decoding raw data.
          </p>
          {!loading && sessions.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="status-pill">{sessions.length} logged workout{sessions.length !== 1 ? 's' : ''}</span>
              <span className="status-pill">Grouped by month</span>
            </div>
          )}
        </section>

        <div className="mt-8 space-y-8">
          {loading && sessions.length === 0 && (
            <section className="section-shell">
              <div className="space-y-3">
                {[...Array(5)].map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full rounded-[28px]" />
                ))}
              </div>
            </section>
          )}

          {!loading && sessions.length === 0 && (
            <section className="section-shell">
              <div className="premium-card page-reveal delay-2 flex flex-col items-center gap-3 px-5 py-14 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/14 text-primary">
                  <Dumbbell className="h-7 w-7" />
                </div>
                <h2 className="font-display text-2xl font-semibold">No workouts logged yet</h2>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  Finish a workout and it will show up here with a clearer summary of what you trained.
                </p>
              </div>
            </section>
          )}

          {groups.map(([month, items], index) => (
            <section key={month} className="section-shell">
              <div className="section-heading">
                <div>
                  <h2 className="section-title">{month}</h2>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/75">
                    {items.length} session{items.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
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
                  className="premium-button-secondary mt-4 w-full justify-center"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
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
    </div>
  );
}
