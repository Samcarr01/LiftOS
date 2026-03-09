/**
 * WorkoutComplete — shown after a workout is finished.
 *
 * Displays duration, sets, volume, and any new PRs with a pop-in animation.
 * "Done" navigates home and clears the completion store.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompletionStore, type PRRecord } from '@/store/completion-store';
import { formatDuration } from '@/lib/utils';

// ── PR card ───────────────────────────────────────────────────────────────────

const PR_LABELS: Record<string, string> = {
  best_weight: 'Heaviest Weight',
  best_reps_at_weight: 'Most Reps at Weight',
  best_e1rm: 'Estimated 1RM',
};

const PR_UNITS: Record<string, string> = {
  best_weight: 'kg',
  best_reps_at_weight: 'reps',
  best_e1rm: 'kg e1RM',
};

function formatPRValue(pr: PRRecord): string {
  const unit = PR_UNITS[pr.recordType] ?? '';
  const value = pr.recordType === 'best_e1rm'
    ? pr.recordValue.toFixed(1)
    : String(pr.recordValue);
  return `${value} ${unit}`;
}

interface PRCardProps {
  pr: PRRecord;
  delay: number;
}

function PRCard({ pr, delay }: PRCardProps) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          tension: 120,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, opacity, scale]);

  const previousLabel = pr.previousValue
    ? ` (prev: ${pr.previousValue})`
    : ' (first time!)';

  return (
    <Animated.View style={[styles.prCard, { transform: [{ scale }], opacity }]}>
      <View style={styles.prTrophy}>
        <Text style={styles.prTrophyIcon}>🏆</Text>
      </View>
      <View style={styles.prInfo}>
        <Text style={styles.prExercise} numberOfLines={1}>{pr.exerciseName}</Text>
        <Text style={styles.prType}>{PR_LABELS[pr.recordType] ?? pr.recordType}</Text>
        <Text style={styles.prValue}>{formatPRValue(pr)}</Text>
        <Text style={styles.prPrevious}>{previousLabel}</Text>
      </View>
    </Animated.View>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      {unit && <Text style={styles.statUnit}>{unit}</Text>}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── WorkoutComplete ───────────────────────────────────────────────────────────

export function WorkoutComplete() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const result = useCompletionStore((s) => s.result);
  const clear = useCompletionStore((s) => s.clear);

  const headerScale = useRef(new Animated.Value(0.8)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(headerScale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [headerOpacity, headerScale]);

  const handleDone = () => {
    clear();
    router.replace('/(tabs)');
  };

  if (!result) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>No completion data found.</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { summary, newPRs } = result;
  const volumeDisplay = summary.totalVolumeKg >= 1000
    ? `${(summary.totalVolumeKg / 1000).toFixed(1)}t`
    : `${summary.totalVolumeKg}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <Animated.View
          style={[styles.hero, { transform: [{ scale: headerScale }], opacity: headerOpacity }]}
        >
          <Text style={styles.heroIcon}>💪</Text>
          <Text style={styles.heroTitle}>Workout Complete!</Text>
          <Text style={styles.heroDuration}>{formatDuration(summary.durationSeconds)}</Text>
          {summary.isOffline && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>⚡ PRs will sync when back online</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Stats row ─────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatTile
            label="Exercises"
            value={String(summary.exerciseCount)}
          />
          <View style={styles.statDivider} />
          <StatTile
            label="Sets"
            value={String(summary.totalSets)}
          />
          <View style={styles.statDivider} />
          <StatTile
            label="Volume"
            value={volumeDisplay}
            unit="kg"
          />
        </View>

        {/* ── PRs ───────────────────────────────────────────────────────── */}
        {newPRs.length > 0 && (
          <View style={styles.prsSection}>
            <Text style={styles.prsSectionTitle}>
              {newPRs.length} New Personal Record{newPRs.length !== 1 ? 's' : ''}!
            </Text>
            {newPRs.map((pr, i) => (
              <PRCard
                key={`${pr.exerciseId}-${pr.recordType}`}
                pr={pr}
                delay={i * 150 + 300}
              />
            ))}
          </View>
        )}

        {newPRs.length === 0 && !summary.isOffline && (
          <View style={styles.noPrsBox}>
            <Text style={styles.noPrsText}>No new PRs today — keep grinding! 🔥</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Done button ───────────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.85}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  heroIcon: { fontSize: 56 },
  heroTitle: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroDuration: {
    color: '#64748b',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  offlineBadge: {
    backgroundColor: '#1c1917',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  offlineBadgeText: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '600',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginTop: -4,
  },
  statLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#334155',
  },

  // PRs
  prsSection: { gap: 10, marginBottom: 20 },
  prsSectionTitle: {
    color: '#a3e635',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  prCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#4d7c0f',
    padding: 16,
    alignItems: 'center',
    gap: 14,
  },
  prTrophy: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a2e0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prTrophyIcon: { fontSize: 24 },
  prInfo: { flex: 1, gap: 2 },
  prExercise: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  prType: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  prValue: {
    color: '#a3e635',
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  prPrevious: {
    color: '#475569',
    fontSize: 11,
  },

  // No PRs
  noPrsBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  noPrsText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  doneBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
  },

  // Error
  errorText: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
  },
});
