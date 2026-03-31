'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Award,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionFrequency } from '@/components/progress/session-frequency';
import { useWeeklySummaries } from '@/hooks/use-weekly-summaries';
import type { WeeklySummaryData } from '@/types/app';

const WeeklyVolumeTrend = dynamic(
  () => import('@/components/progress/weekly-volume-trend').then((m) => m.WeeklyVolumeTrend),
  { ssr: false, loading: () => <Skeleton className="h-[160px] w-full rounded-2xl" /> },
);
const MuscleSplitChart = dynamic(
  () => import('@/components/progress/muscle-split-chart').then((m) => m.MuscleSplitChart),
  { ssr: false, loading: () => <Skeleton className="h-[200px] w-full rounded-2xl" /> },
);

function StatCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="stat-card">
      {icon && <div className="mb-1">{icon}</div>}
      <p className="text-stat">{value}</p>
      <p className="text-caption">{label}</p>
    </div>
  );
}

function InsightSection({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4`}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg`} style={{ background: `${color}20` }}>
          {icon}
        </div>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {children}
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

  const ai = summary?.ai_analysis;
  const hasChartData = (summary?.volume_by_week?.length ?? 0) > 0;
  const hasMuscleSplit = (summary?.muscle_split?.length ?? 0) > 0;
  const prsCount = summary?.prs_this_week?.length ?? 0;

  return (
    <div className="page-shell">
      <div className="page-content space-y-4 py-5 md:py-7">
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
            <Skeleton className="h-20 rounded-2xl" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : summary ? (
          <>
            {/* AI Headline */}
            {ai?.headline && (
              <div className="content-card border-primary/20 bg-primary/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-medium leading-relaxed pt-1.5">
                    {ai.headline}
                  </p>
                </div>
              </div>
            )}

            {/* Stat cards — 2×2 grid */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Workouts" value={String(summary.workouts_completed)} />
              <StatCard label="Working Sets" value={String(summary.total_sets)} />
              <StatCard
                label="Volume"
                value={summary.total_volume_kg >= 1000
                  ? `${(summary.total_volume_kg / 1000).toFixed(1)}t`
                  : `${Math.round(summary.total_volume_kg)}kg`
                }
              />
              <StatCard label="PRs" value={String(prsCount)} />
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

            {/* Volume Trend chart */}
            {hasChartData && (
              <div className="content-card">
                <h3 className="font-display text-sm font-bold mb-3">Volume Trend</h3>
                <WeeklyVolumeTrend data={summary.volume_by_week!} />
              </div>
            )}

            {/* Training Days */}
            {summary.session_days && summary.session_days.length > 0 && (
              <div className="content-card">
                <h3 className="font-display text-sm font-bold mb-3">Training Days</h3>
                <SessionFrequency activeDays={summary.session_days} />
              </div>
            )}

            {/* Muscle Split chart */}
            {hasMuscleSplit && (
              <div className="content-card">
                <h3 className="font-display text-sm font-bold mb-3">Muscle Volume Split</h3>
                <MuscleSplitChart data={summary.muscle_split!} />
              </div>
            )}

            {/* Exercise Highlights */}
            {summary.exercise_highlights && summary.exercise_highlights.length > 0 && (
              <div className="content-card">
                <h3 className="font-display text-sm font-bold mb-3">Exercise Breakdown</h3>
                <div className="space-y-2">
                  {summary.exercise_highlights.map((ex) => (
                    <div
                      key={ex.name}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{ex.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ex.sets} sets · {Math.round(ex.volume)}kg · Best: {ex.best_set}
                        </p>
                      </div>
                      {ex.delta_pct !== null && (
                        <span className={`shrink-0 text-xs font-semibold ${
                          ex.delta_pct > 0 ? 'text-[oklch(0.72_0.19_155)]' :
                          ex.delta_pct < 0 ? 'text-destructive' :
                          'text-muted-foreground'
                        }`}>
                          {ex.delta_pct > 0 ? '+' : ''}{ex.delta_pct}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PRs this week */}
            {prsCount > 0 && (
              <div className="content-card">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="h-4 w-4 text-[oklch(0.85_0.15_85)]" />
                  <h3 className="font-display text-sm font-bold">Personal Records</h3>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {summary.prs_this_week!.map((pr, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-xl border border-[oklch(0.80_0.16_85/0.25)] bg-[oklch(0.80_0.16_85/0.08)] px-3 py-2.5"
                    >
                      <Trophy className="h-3.5 w-3.5 shrink-0 text-[oklch(0.85_0.15_85)]" />
                      <span className="text-sm font-medium">{pr.exercise}</span>
                      <span className="ml-auto text-xs font-semibold text-[oklch(0.85_0.15_85)]">
                        {pr.record_type.replace('best_', '').replace(/_/g, ' ')} — {pr.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Insights — structured sections */}
            {ai && (
              <div className="space-y-3">
                {/* Wins */}
                {ai.wins.length > 0 && (
                  <InsightSection
                    icon={<Flame className="h-3.5 w-3.5" style={{ color: 'oklch(0.75 0.18 55)' }} />}
                    title="Wins"
                    color="oklch(0.75 0.18 55)"
                  >
                    <ul className="space-y-1.5">
                      {ai.wins.map((win, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {win}
                        </li>
                      ))}
                    </ul>
                  </InsightSection>
                )}

                {/* Focus Areas */}
                {ai.focus_areas.length > 0 && (
                  <InsightSection
                    icon={<Target className="h-3.5 w-3.5" style={{ color: 'oklch(0.72 0.19 155)' }} />}
                    title="Focus Areas"
                    color="oklch(0.72 0.19 155)"
                  >
                    <ul className="space-y-1.5">
                      {ai.focus_areas.map((area, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[oklch(0.72_0.19_155)]" />
                          {area}
                        </li>
                      ))}
                    </ul>
                  </InsightSection>
                )}

                {/* Exercise Callouts */}
                {ai.exercise_callouts.length > 0 && (
                  <InsightSection
                    icon={<Dumbbell className="h-3.5 w-3.5" style={{ color: 'oklch(0.72 0.15 250)' }} />}
                    title="Exercise Notes"
                    color="oklch(0.72 0.15 250)"
                  >
                    <div className="space-y-2">
                      {ai.exercise_callouts.map((callout, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium text-foreground">{callout.name}</span>
                          <span className="text-muted-foreground"> — {callout.note}</span>
                        </div>
                      ))}
                    </div>
                  </InsightSection>
                )}

                {/* Next Week Tip */}
                {ai.next_week_tip && (
                  <InsightSection
                    icon={<Zap className="h-3.5 w-3.5" style={{ color: 'oklch(0.80 0.16 85)' }} />}
                    title="Next Week"
                    color="oklch(0.80 0.16 85)"
                  >
                    <p className="text-sm text-muted-foreground">{ai.next_week_tip}</p>
                  </InsightSection>
                )}

                {/* Training Consistency */}
                {ai.training_consistency && (
                  <InsightSection
                    icon={<TrendingUp className="h-3.5 w-3.5" style={{ color: 'oklch(0.72 0.19 155)' }} />}
                    title="Consistency"
                    color="oklch(0.72 0.19 155)"
                  >
                    <p className="text-sm text-muted-foreground">{ai.training_consistency}</p>
                  </InsightSection>
                )}
              </div>
            )}

            {/* Fallback: show old insight if no ai_analysis */}
            {!ai && summary.insight && (
              <div className="content-card">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                  <h3 className="font-display text-sm font-bold">AI Insight</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {summary.insight}
                </p>
              </div>
            )}

            {/* Generate / Refresh button */}
            <button
              onClick={() => void generate()}
              disabled={generating}
              className="premium-button w-full justify-center disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {generating ? 'Generating...' : 'Regenerate Summary'}
            </button>
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
                Generate an AI-powered recap of this week&apos;s training.
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

        <div className="pb-4" />
      </div>
    </div>
  );
}
