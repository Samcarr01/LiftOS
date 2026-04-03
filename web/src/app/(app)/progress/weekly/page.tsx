'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronDown,
  Dumbbell,
  Flame,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrainingSummary } from '@/hooks/use-weekly-summaries';

const WeeklyVolumeTrend = dynamic(
  () => import('@/components/progress/weekly-volume-trend').then((m) => m.WeeklyVolumeTrend),
  { ssr: false, loading: () => <Skeleton className="h-[160px] w-full rounded-2xl" /> },
);
const MuscleSplitChart = dynamic(
  () => import('@/components/progress/muscle-split-chart').then((m) => m.MuscleSplitChart),
  { ssr: false, loading: () => <Skeleton className="h-[200px] w-full rounded-2xl" /> },
);

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
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}20` }}>
          {icon}
        </div>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {children}
    </div>
  );
}

const TRAJECTORY_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  improving: { icon: <TrendingUp className="h-3 w-3" />, color: 'text-[oklch(0.72_0.19_155)]' },
  stalled:   { icon: <Activity className="h-3 w-3" />, color: 'text-[oklch(0.80_0.16_85)]' },
  declining: { icon: <TrendingDown className="h-3 w-3" />, color: 'text-destructive' },
};

const PR_LABEL: Record<string, string> = {
  best_weight: 'Weight',
  best_reps_at_weight: 'Reps',
  best_e1rm: 'Est. 1RM',
  best_volume: 'Volume',
};

// Group PRs by exercise, pick best record type per exercise
function groupPRs(prs: { exercise: string; record_type: string; value: number }[]) {
  const byExercise = new Map<string, { exercise: string; records: { type: string; value: number }[] }>();
  for (const pr of prs) {
    if (pr.exercise === 'Unknown') continue;
    if (!byExercise.has(pr.exercise)) {
      byExercise.set(pr.exercise, { exercise: pr.exercise, records: [] });
    }
    byExercise.get(pr.exercise)!.records.push({ type: pr.record_type, value: pr.value });
  }
  // Sort by number of records (most notable first)
  return [...byExercise.values()].sort((a, b) => b.records.length - a.records.length);
}

export default function TrainingSummaryPage() {
  const router = useRouter();
  const {
    summary,
    loading,
    generating,
    error,
    periodLabel,
    refresh,
  } = useTrainingSummary();

  const [showAllExercises, setShowAllExercises] = useState(false);
  const [showAllPRs, setShowAllPRs] = useState(false);

  const ai = summary?.ai_analysis;
  const hasChartData = (summary?.volume_by_week?.length ?? 0) > 0;
  const hasMuscleSplit = (summary?.muscle_split?.length ?? 0) > 0;
  const prsCount = summary?.prs_this_week?.length ?? 0;
  const freq = summary?.training_frequency;
  const groupedPRs = summary?.prs_this_week ? groupPRs(summary.prs_this_week) : [];

  const exercises = summary?.exercise_highlights ?? [];
  const visibleExercises = showAllExercises ? exercises : exercises.slice(0, 5);
  const visiblePRGroups = showAllPRs ? groupedPRs : groupedPRs.slice(0, 5);

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
          <div>
            <h1 className="font-display text-lg font-bold">Training Summary</h1>
            <p className="text-sm text-muted-foreground">Last 30 Days · {periodLabel}</p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {(loading || generating) && !summary ? (
          <div className="space-y-3">
            <div className="content-card border-primary/20 bg-primary/[0.06] py-6 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                {generating ? 'Generating your 30-day coaching report...' : 'Loading summary...'}
              </p>
            </div>
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
            {/* ─── AI COACHING (hero content) ─── */}

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

            {/* AI Insights — the main value of this page */}
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

                {/* Volume Trend Analysis */}
                {ai.volume_trend_analysis && (
                  <InsightSection
                    icon={<TrendingUp className="h-3.5 w-3.5" style={{ color: 'oklch(0.72 0.15 250)' }} />}
                    title="Volume Trend"
                    color="oklch(0.72 0.15 250)"
                  >
                    <p className="text-sm text-muted-foreground leading-relaxed">{ai.volume_trend_analysis}</p>
                  </InsightSection>
                )}

                {/* Muscle Balance Assessment */}
                {ai.muscle_balance_assessment && (
                  <InsightSection
                    icon={<Activity className="h-3.5 w-3.5" style={{ color: 'oklch(0.70 0.15 180)' }} />}
                    title="Muscle Balance"
                    color="oklch(0.70 0.15 180)"
                  >
                    <p className="text-sm text-muted-foreground leading-relaxed">{ai.muscle_balance_assessment}</p>
                  </InsightSection>
                )}

                {/* Exercise Spotlight */}
                {ai.exercise_callouts.length > 0 && (
                  <InsightSection
                    icon={<Dumbbell className="h-3.5 w-3.5" style={{ color: 'oklch(0.72 0.15 250)' }} />}
                    title="Exercise Spotlight"
                    color="oklch(0.72 0.15 250)"
                  >
                    <div className="space-y-2">
                      {ai.exercise_callouts.map((callout, i) => {
                        const traj = callout.trajectory ? TRAJECTORY_ICON[callout.trajectory] : null;
                        return (
                          <div key={i} className="text-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground">{callout.name}</span>
                              {traj && (
                                <span className={`flex items-center gap-0.5 text-xs font-semibold ${traj.color}`}>
                                  {traj.icon}
                                  {callout.trajectory}
                                </span>
                              )}
                            </div>
                            <span className="text-muted-foreground">{callout.note}</span>
                          </div>
                        );
                      })}
                    </div>
                  </InsightSection>
                )}

                {/* Action Items */}
                {ai.action_items && ai.action_items.length > 0 && (
                  <InsightSection
                    icon={<CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'oklch(0.72 0.19 155)' }} />}
                    title="Action Items"
                    color="oklch(0.72 0.19 155)"
                  >
                    <ul className="space-y-1.5">
                      {ai.action_items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[oklch(0.72_0.19_155)]" />
                          {item}
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

                {/* PR Momentum */}
                {ai.pr_momentum && (
                  <InsightSection
                    icon={<Trophy className="h-3.5 w-3.5" style={{ color: 'oklch(0.80 0.16 85)' }} />}
                    title="PR Momentum"
                    color="oklch(0.80 0.16 85)"
                  >
                    <p className="text-sm text-muted-foreground">{ai.pr_momentum}</p>
                  </InsightSection>
                )}

                {/* Training Consistency */}
                {ai.training_consistency && (
                  <InsightSection
                    icon={<Zap className="h-3.5 w-3.5" style={{ color: 'oklch(0.75 0.18 55)' }} />}
                    title="Consistency"
                    color="oklch(0.75 0.18 55)"
                  >
                    <p className="text-sm text-muted-foreground">{ai.training_consistency}</p>
                  </InsightSection>
                )}

                {/* Legacy: next_week_tip for old summaries */}
                {ai.next_week_tip && !ai.action_items?.length && (
                  <InsightSection
                    icon={<Zap className="h-3.5 w-3.5" style={{ color: 'oklch(0.80 0.16 85)' }} />}
                    title="Next Step"
                    color="oklch(0.80 0.16 85)"
                  >
                    <p className="text-sm text-muted-foreground">{ai.next_week_tip}</p>
                  </InsightSection>
                )}
              </div>
            )}

            {/* No AI yet — prompt to generate */}
            {!ai && (
              <div className="content-card border-primary/20 bg-primary/[0.06] text-center py-5">
                <Sparkles className="mx-auto h-5 w-5 text-primary" />
                <p className="mt-2 text-sm font-medium">AI coaching insights not generated yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Tap Refresh Analysis below to generate your personalised coaching report</p>
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

            {/* ─── SUPPORTING DATA ─── */}

            {/* Quick stats — compact 2x2 grid */}
            <div className="grid grid-cols-4 gap-2">
              <div className="stat-card">
                <p className="text-stat text-lg">{summary.workouts_completed}</p>
                <p className="text-caption text-xs">Workouts</p>
              </div>
              <div className="stat-card">
                <p className="text-stat text-lg">{summary.total_sets}</p>
                <p className="text-caption text-xs">Sets</p>
              </div>
              <div className="stat-card">
                <p className="text-stat text-lg">
                  {summary.total_volume_kg >= 1000
                    ? `${(summary.total_volume_kg / 1000).toFixed(1)}t`
                    : `${Math.round(summary.total_volume_kg)}kg`
                  }
                </p>
                <p className="text-caption text-xs">Volume</p>
              </div>
              <div className="stat-card">
                <p className="text-stat text-lg">{prsCount}</p>
                <p className="text-caption text-xs">PRs</p>
              </div>
            </div>

            {/* Training frequency + strongest lift — side by side */}
            <div className="grid grid-cols-2 gap-2">
              {freq && (
                <div className="content-card">
                  <p className="text-xs text-muted-foreground">Frequency</p>
                  <p className="font-display text-base font-bold mt-0.5">{freq.avg_per_week}/week</p>
                  <p className="text-xs text-muted-foreground">{freq.total_days} sessions</p>
                </div>
              )}
              {summary.strongest_lift && (
                <div className="content-card">
                  <p className="text-xs text-muted-foreground">Strongest</p>
                  <p className="font-display text-sm font-bold mt-0.5 truncate">{summary.strongest_lift.exercise}</p>
                  <p className="text-xs font-semibold text-primary">{summary.strongest_lift.value}</p>
                </div>
              )}
            </div>

            {/* Volume Trend chart */}
            {hasChartData && (
              <div className="content-card">
                <h3 className="font-display text-sm font-bold mb-3">Volume Trend</h3>
                <WeeklyVolumeTrend data={summary.volume_by_week!} />
              </div>
            )}

            {/* Muscle Split chart */}
            {hasMuscleSplit && (
              <div className="content-card">
                <h3 className="font-display text-sm font-bold mb-3">Muscle Volume Split</h3>
                <MuscleSplitChart data={summary.muscle_split!} />
              </div>
            )}

            {/* Exercise Breakdown — top 5, expandable */}
            {exercises.length > 0 && (
              <div className="content-card">
                <h3 className="font-display text-sm font-bold mb-3">Exercise Breakdown</h3>
                <div className="space-y-2">
                  {visibleExercises.map((ex) => (
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
                {exercises.length > 5 && (
                  <button
                    onClick={() => setShowAllExercises(!showAllExercises)}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllExercises ? 'rotate-180' : ''}`} />
                    {showAllExercises ? 'Show less' : `Show all ${exercises.length} exercises`}
                  </button>
                )}
              </div>
            )}

            {/* PRs — grouped by exercise, top 5 */}
            {groupedPRs.length > 0 && (
              <div className="content-card">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-bold">Personal Records</h3>
                  <span className="ml-auto text-xs text-muted-foreground">{prsCount} total</span>
                </div>
                <div className="space-y-2">
                  {visiblePRGroups.map((group) => (
                    <div
                      key={group.exercise}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <p className="text-sm font-medium">{group.exercise}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {group.records.map((r) => (
                          <span key={r.type} className="text-xs text-primary font-semibold">
                            {PR_LABEL[r.type] ?? r.type.replace('best_', '')} {r.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {groupedPRs.length > 5 && (
                  <button
                    onClick={() => setShowAllPRs(!showAllPRs)}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllPRs ? 'rotate-180' : ''}`} />
                    {showAllPRs ? 'Show less' : `Show all ${groupedPRs.length} exercises`}
                  </button>
                )}
              </div>
            )}

            {/* Refresh button */}
            <button
              onClick={() => void refresh()}
              disabled={generating}
              className="premium-button w-full justify-center disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {generating ? 'Generating...' : 'Refresh Analysis'}
            </button>
          </>
        ) : (
          /* Empty state */
          <div className="content-card flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-base font-semibold">No training data</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete some workouts to generate your 30-day coaching report.
              </p>
            </div>
            <button
              onClick={() => void refresh()}
              disabled={generating}
              className="premium-button disabled:opacity-60"
            >
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate Report
            </button>
          </div>
        )}

        <div className="pb-4" />
      </div>
    </div>
  );
}
