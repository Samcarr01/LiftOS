/**
 * SessionDetail — full view of a completed workout session.
 *
 * Shows: date/time, duration, stats row, PR badges per exercise,
 * all sets logged with values formatted by tracking_schema.
 */
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSessionDetail } from '@/hooks/use-history';
import { PRBadge } from '@/components/history/pr-badge';
import { formatDuration, formatLongDate, formatTime } from '@/lib/utils';
import type { SessionDetailExercise, SessionDetailSet } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';

// ── Set value formatter ───────────────────────────────────────────────────────

const SET_TYPE_LABELS: Record<string, string> = {
  warmup:  'W',
  working: '',
  top:     'T',
  drop:    'D',
  failure: 'F',
};

function formatSetValues(values: Record<string, unknown>, fields: TrackingSchema['fields']): string {
  const parts: string[] = [];

  for (const field of fields) {
    const raw = values[field.key];
    if (raw == null || raw === '' || raw === 0) continue;

    const num = Number(raw);

    if (field.unit === 'seconds') {
      if (num >= 60) {
        const m = Math.floor(num / 60);
        const s = num % 60;
        parts.push(`${m}:${String(s).padStart(2, '0')}`);
      } else {
        parts.push(`${num}s`);
      }
    } else if (field.unit) {
      parts.push(`${raw} ${field.unit}`);
    } else {
      parts.push(`${raw} ${field.label.toLowerCase()}`);
    }
  }

  return parts.join(' × ') || String(Object.values(values).filter(Boolean).join(' / '));
}

// ── PR label map ──────────────────────────────────────────────────────────────

const PR_LABELS: Record<string, string> = {
  best_weight:          'Heaviest Weight',
  best_reps_at_weight:  'Most Reps',
  best_e1rm:            'Est. 1RM',
  best_volume:          'Volume PR',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      {unit && <Text style={styles.statUnit}>{unit}</Text>}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface SetRowProps {
  set:    SessionDetailSet;
  fields: TrackingSchema['fields'];
  index:  number; // display index (1-based)
}

function SetRowDisplay({ set, fields, index }: SetRowProps) {
  const typeLabel = SET_TYPE_LABELS[set.set_type] ?? '';
  const display   = formatSetValues(set.values as Record<string, unknown>, fields);

  return (
    <View style={[styles.setRow, !set.is_completed && styles.setRowIncomplete]}>
      <Text style={styles.setIndex}>{index}</Text>
      {typeLabel ? (
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{typeLabel}</Text>
        </View>
      ) : null}
      <Text style={[styles.setValues, !set.is_completed && styles.setValuesIncomplete]}>
        {display}
      </Text>
      {set.is_completed && <Text style={styles.checkmark}>✓</Text>}
    </View>
  );
}

interface ExerciseBlockProps {
  ex: SessionDetailExercise;
}

function ExerciseBlock({ ex }: ExerciseBlockProps) {
  const completedSets = ex.sets.filter((s) => s.is_completed);

  return (
    <View style={styles.exerciseBlock}>
      {/* Header */}
      <View style={styles.exerciseHeader}>
        <View style={styles.exerciseTitleRow}>
          <Text style={styles.exerciseName} numberOfLines={1}>{ex.exercise_name}</Text>
          {ex.muscle_groups.length > 0 && (
            <Text style={styles.muscleGroup}>{ex.muscle_groups[0]}</Text>
          )}
        </View>

        {/* PR badges */}
        {ex.prs.length > 0 && (
          <View style={styles.prsRow}>
            {ex.prs.map((pr) => (
              <PRBadge
                key={pr.record_type}
                label={PR_LABELS[pr.record_type] ?? 'PR'}
              />
            ))}
          </View>
        )}
      </View>

      {/* Sets */}
      <View style={styles.setsBlock}>
        {ex.sets.map((set, i) => (
          <SetRowDisplay
            key={set.id}
            set={set}
            fields={ex.tracking_schema.fields}
            index={i + 1}
          />
        ))}
      </View>

      {/* Summary */}
      <Text style={styles.exerciseSummary}>
        {completedSets.length} / {ex.sets.length} sets completed
      </Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function SessionDetail() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { detail, isLoading, error } = useSessionDetail(id ?? '');

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#a3e635" size="large" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? 'Session not found.'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dateStr     = detail.completed_at ?? detail.started_at;
  const templateName = detail.template_name ?? 'Quick Workout';
  const duration    = detail.duration_seconds
    ? formatDuration(detail.duration_seconds)
    : '—';
  const volumeLabel = detail.total_volume_kg >= 1000
    ? `${(detail.total_volume_kg / 1000).toFixed(1)}t`
    : `${detail.total_volume_kg}`;

  const totalPRs = detail.exercises.reduce((n, ex) => n + ex.prs.length, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Sticky header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backIcon}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIconText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{templateName}</Text>
          <Text style={styles.headerSub}>{formatLongDate(dateStr)}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerTime}>{formatTime(detail.started_at)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatTile label="Duration" value={duration} />
          <View style={styles.statDivider} />
          <StatTile label="Exercises" value={String(detail.exercises.length)} />
          <View style={styles.statDivider} />
          <StatTile label="Sets" value={String(detail.total_sets)} />
          <View style={styles.statDivider} />
          <StatTile label="Volume" value={volumeLabel} unit="kg" />
        </View>

        {/* PR highlight banner */}
        {totalPRs > 0 && (
          <View style={styles.prBanner}>
            <Text style={styles.prBannerText}>
              🏆 {totalPRs} new personal record{totalPRs !== 1 ? 's' : ''} this session!
            </Text>
          </View>
        )}

        {/* Exercise blocks */}
        {detail.exercises.map((ex) => (
          <ExerciseBlock key={ex.session_exercise_id} ex={ex} />
        ))}

        {/* Session notes */}
        {detail.notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Session Notes</Text>
            <Text style={styles.notesText}>{detail.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  center: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: { color: '#94a3b8', fontSize: 16, textAlign: 'center' },
  backBtn: {
    backgroundColor: '#a3e635',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtnText: { color: '#0f172a', fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  backIcon: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIconText: { color: '#a3e635', fontSize: 22, fontWeight: '700' },
  headerCenter: { flex: 1 },
  headerTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  headerSub:   { color: '#64748b', fontSize: 12, marginTop: 1 },
  headerRight: { alignItems: 'flex-end' },
  headerTime:  { color: '#475569', fontSize: 13 },

  // Scroll
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statUnit:  { color: '#64748b', fontSize: 11, fontWeight: '600', marginTop: -2 },
  statLabel: { color: '#475569', fontSize: 11, fontWeight: '500', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: '#334155' },

  // PR banner
  prBanner: {
    backgroundColor: '#1a2e0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4d7c0f',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  prBannerText: {
    color: '#a3e635',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Exercise block
  exerciseBlock: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    overflow: 'hidden',
  },
  exerciseHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  exerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exerciseName: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  muscleGroup: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  prsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },

  // Sets
  setsBlock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  setRowIncomplete: { opacity: 0.45 },
  setIndex: {
    width: 20,
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  typeBadge: {
    backgroundColor: '#0f172a',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typeBadgeText: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  setValues: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  setValuesIncomplete: { color: '#475569' },
  checkmark: { color: '#a3e635', fontSize: 14, fontWeight: '700' },

  exerciseSummary: {
    color: '#334155',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  // Notes
  notesBlock: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  notesLabel: { color: '#475569', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  notesText:  { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
});
