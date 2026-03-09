/**
 * WeeklySummaryScreen — week navigator + stats cards + AI insight.
 *
 * Week navigation: ← / → arrows. Future weeks are blocked.
 * Stats: Workouts · Volume · Sets with ▲/▼ delta vs previous week.
 * Strongest lift card, most improved muscle group, AI insight paragraph.
 */
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  useWeeklySummary, formatWeekStart,
} from '@/hooks/use-weekly-summary';
import type { WeeklySummaryData } from '@/types/app';

// ── Delta helpers ──────────────────────────────────────────────────────────────

function delta(cur: number, prev: number | undefined): { pct: number; positive: boolean } | null {
  if (prev == null || prev === 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct, positive: pct >= 0 };
}

function DeltaBadge({ cur, prev }: { cur: number; prev: number | undefined }) {
  const d = delta(cur, prev);
  if (!d) return null;
  const color = d.positive ? '#a3e635' : '#f87171';
  return (
    <Text style={[styles.deltaBadge, { color }]}>
      {d.positive ? '▲' : '▼'} {Math.abs(d.pct)}%
    </Text>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, prevValue,
}: {
  label: string;
  value: string;
  sub?: string;
  prevValue?: number;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
      {prevValue !== undefined && (
        <DeltaBadge cur={parseFloat(value)} prev={prevValue} />
      )}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ weekStart }: { weekStart: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🗓</Text>
      <Text style={styles.emptyTitle}>No workouts this week</Text>
      <Text style={styles.emptyHint}>
        Complete a workout during {formatWeekStart(weekStart)} to see your summary.
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function WeeklySummaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    weekStart, summary, prevSummary,
    isLoading, error, canGoNext,
    goToPrevWeek, goToNextWeek, refresh,
  } = useWeeklySummary();

  const prev = prevSummary as WeeklySummaryData | null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>‹ Progress</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Weekly Summary</Text>
      </View>

      {/* ── Week navigator ── */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={goToPrevWeek}
          style={styles.navBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.weekLabel}>{formatWeekStart(weekStart)}</Text>

        <TouchableOpacity
          onPress={goToNextWeek}
          style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
          disabled={!canGoNext}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.navArrow, !canGoNext && styles.navArrowDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Loading ── */}
      {isLoading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#a3e635" size="large" />
          <Text style={styles.loadingText}>Generating summary…</Text>
        </View>
      )}

      {/* ── Error ── */}
      {error && !isLoading && (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Content ── */}
      {!isLoading && !error && (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refresh}
              tintColor="#a3e635"
            />
          }
        >
          {summary && summary.workouts_completed === 0 ? (
            <EmptyState weekStart={weekStart} />
          ) : summary ? (
            <>
              {/* Stats row */}
              <View style={styles.statsRow}>
                <StatCard
                  label="Workouts"
                  value={String(summary.workouts_completed)}
                  prevValue={prev?.workouts_completed}
                />
                <StatCard
                  label="Volume"
                  value={`${summary.total_volume_kg.toLocaleString()}`}
                  sub="kg"
                  prevValue={prev?.total_volume_kg}
                />
                <StatCard
                  label="Sets"
                  value={String(summary.total_sets)}
                  prevValue={prev?.total_sets}
                />
              </View>

              {/* Strongest lift */}
              {summary.strongest_lift && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Strongest Lift</Text>
                  <View style={styles.highlightCard}>
                    <Text style={styles.highlightIcon}>🏋️</Text>
                    <View style={styles.highlightBody}>
                      <Text style={styles.highlightTitle}>
                        {summary.strongest_lift.exercise}
                      </Text>
                      <Text style={styles.highlightSub}>
                        {summary.strongest_lift.value}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Most improved muscle group */}
              {summary.most_improved_group && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Most Improved</Text>
                  <View style={[styles.highlightCard, styles.muscleCard]}>
                    <Text style={styles.highlightIcon}>💪</Text>
                    <View style={styles.highlightBody}>
                      <Text style={styles.highlightTitle}>
                        {summary.most_improved_group}
                      </Text>
                      {prev?.muscle_volume?.[summary.most_improved_group] != null &&
                        summary.muscle_volume?.[summary.most_improved_group] != null && (
                        <Text style={styles.highlightSub}>
                          {Math.round(
                            (summary.muscle_volume![summary.most_improved_group] -
                              (prev?.muscle_volume?.[summary.most_improved_group] ?? 0)),
                          ).toLocaleString()} kg volume increase
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {/* Muscle volume breakdown */}
              {summary.muscle_volume && Object.keys(summary.muscle_volume).length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Volume by Muscle Group</Text>
                  <View style={styles.muscleList}>
                    {Object.entries(summary.muscle_volume)
                      .sort(([, a], [, b]) => b - a)
                      .map(([group, vol]) => {
                        const maxVol = Math.max(...Object.values(summary.muscle_volume!));
                        const pct    = maxVol > 0 ? vol / maxVol : 0;
                        return (
                          <View key={group} style={styles.muscleRow}>
                            <Text style={styles.muscleLabel}>{group}</Text>
                            <View style={styles.muscleBarBg}>
                              <View style={[styles.muscleBarFill, { width: `${Math.round(pct * 100)}%` }]} />
                            </View>
                            <Text style={styles.muscleVol}>{Math.round(vol).toLocaleString()} kg</Text>
                          </View>
                        );
                      })}
                  </View>
                </View>
              )}

              {/* AI insight */}
              {summary.insight && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>AI Insight</Text>
                  <View style={styles.insightCard}>
                    <Text style={styles.insightBadge}>✦ AI</Text>
                    <Text style={styles.insightText}>{summary.insight}</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <EmptyState weekStart={weekStart} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0f172a' },

  // Header
  header:   { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  backBtn:  { marginBottom: 4 },
  backText: { color: '#a3e635', fontSize: 15, fontWeight: '600' },
  title:    { color: '#f8fafc', fontSize: 26, fontWeight: '800' },

  // Week nav
  weekNav:  {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  navBtn:          { padding: 4 },
  navBtnDisabled:  { opacity: 0.3 },
  navArrow:        { color: '#a3e635', fontSize: 24, fontWeight: '700' },
  navArrowDisabled:{ color: '#475569' },
  weekLabel:       { color: '#f8fafc', fontSize: 15, fontWeight: '700' },

  // Loading / error
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#64748b', fontSize: 14 },
  errorWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText:   { color: '#f87171', fontSize: 14, textAlign: 'center' },
  retryBtn:    { backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:   { color: '#a3e635', fontWeight: '700', fontSize: 14 },

  // Content
  content:  { paddingHorizontal: 16, paddingTop: 16, gap: 20 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: { color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: '#f8fafc', fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statSub:   { color: '#475569', fontSize: 12 },
  deltaBadge:{ fontSize: 11, fontWeight: '700', marginTop: 2 },

  // Section
  section:      { gap: 8 },
  sectionLabel: { color: '#475569', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Highlight cards (strongest lift / most improved)
  highlightCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  muscleCard:      { borderLeftWidth: 3, borderLeftColor: '#a3e635' },
  highlightIcon:   { fontSize: 26 },
  highlightBody:   { flex: 1, gap: 2 },
  highlightTitle:  { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  highlightSub:    { color: '#64748b', fontSize: 13 },

  // Muscle volume bars
  muscleList:    { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, gap: 10 },
  muscleRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muscleLabel:   { color: '#94a3b8', fontSize: 12, fontWeight: '600', width: 70 },
  muscleBarBg:   { flex: 1, height: 8, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  muscleBarFill: { height: '100%', backgroundColor: '#a3e635', borderRadius: 4 },
  muscleVol:     { color: '#475569', fontSize: 11, width: 60, textAlign: 'right' },

  // AI insight
  insightCard: {
    backgroundColor: '#1a1f14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#4d7c0f',
    padding: 14,
    gap: 6,
  },
  insightBadge: { color: '#a3e635', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  insightText:  { color: '#d9f99d', fontSize: 14, lineHeight: 22 },

  // Empty state
  empty:     { alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  emptyIcon: { fontSize: 48 },
  emptyTitle:{ color: '#64748b', fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyHint: { color: '#475569', fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
});
