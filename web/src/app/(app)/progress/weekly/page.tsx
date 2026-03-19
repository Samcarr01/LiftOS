'use client';

import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Award,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeeklySummaries } from '@/hooks/use-weekly-summaries';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="text-stat">{value}</p>
      <p className="text-caption">{label}</p>
    </div>
  );
}

function MuscleVolumeBar({
  muscle,
  volume,
  maxVolume,
}: {
  muscle: string;
  volume: number;
  maxVolume: number;
}) {
  const pct = maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-sm font-medium text-muted-foreground capitalize">
        {muscle}
      </span>
      <div className="min-w-0 flex-1">
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      </div>
      <span className="w-16 shrink-0 text-right text-sm font-semibold">
        {Math.round(volume)}kg
      </span>
    </div>
  );
}

export default function WeeklySummaryPage() {
  const router = useRouter();
  const {
    summary,
    loading,
    generating,
    error,
    weekLabel,
    isCurrentWeek,
    generate,
    goToPreviousWeek,
    goToNextWeek,
  } = useWeeklySummaries();

  const muscleEntries = summary?.muscle_volume
    ? Object.entries(summary.muscle_volume).sort((a, b) => b[1] - a[1])
    : [];
  const maxMuscleVolume = muscleEntries[0]?.[1] ?? 0;

  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-display text-lg font-bold">Weekly Summary</h1>
        </div>

        {/* Week navigator */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={goToPreviousWeek}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-display text-base font-bold">{weekLabel}</span>
          <button
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : summary ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Workouts" value={String(summary.workouts_completed)} />
              <StatCard label="Sets" value={String(summary.total_sets)} />
              <StatCard label="Volume" value={`${Math.round(summary.total_volume_kg)}kg`} />
            </div>

            {/* Strongest lift */}
            {summary.strongest_lift && (
              <div className="content-card flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.80_0.16_85/0.15)] text-[oklch(0.85_0.15_85)]">
                  <Trophy className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-caption">Strongest lift</p>
                  <p className="font-display text-base font-bold">
                    {summary.strongest_lift.exercise}
                  </p>
                  <p className="text-sm font-semibold text-[oklch(0.85_0.15_85)]">
                    {summary.strongest_lift.value}
                  </p>
                </div>
              </div>
            )}

            {/* Most improved */}
            {summary.most_improved_group && (
              <div className="flex items-center gap-3 rounded-2xl border border-[oklch(0.72_0.19_155/0.20)] bg-[oklch(0.72_0.19_155/0.08)] px-4 py-3">
                <TrendingUp className="h-4 w-4 shrink-0 text-[oklch(0.78_0.17_155)]" />
                <div>
                  <p className="text-caption">Most improved</p>
                  <p className="text-sm font-semibold capitalize">{summary.most_improved_group}</p>
                </div>
              </div>
            )}

            {/* Muscle volume breakdown */}
            {muscleEntries.length > 0 && (
              <div className="content-card">
                <h3 className="font-display text-base font-bold">Muscle Volume</h3>
                <div className="mt-3 space-y-2.5">
                  {muscleEntries.map(([muscle, volume]) => (
                    <MuscleVolumeBar
                      key={muscle}
                      muscle={muscle}
                      volume={volume}
                      maxVolume={maxMuscleVolume}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* AI insight */}
            <div className="content-card">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                <h3 className="font-display text-base font-bold">AI Insight</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {summary.insight ?? 'Keep logging for a clearer weekly picture.'}
              </p>
              <button
                onClick={() => void generate()}
                disabled={generating}
                className="mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-muted-foreground disabled:opacity-60 hover:text-foreground"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh insight
              </button>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="content-card flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[oklch(0.75_0.18_55/0.15)] text-primary">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-base font-semibold">No summary yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate a recap for this week&apos;s training.
              </p>
            </div>
            <button
              onClick={() => void generate()}
              disabled={generating}
              className="premium-button disabled:opacity-60"
            >
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate Summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
