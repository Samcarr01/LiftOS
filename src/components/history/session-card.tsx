import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatRelativeDate, formatTime, formatDuration } from '@/lib/utils';
import type { HistorySessionSummary } from '@/types/app';

interface Props {
  session: HistorySessionSummary;
  onPress: () => void;
}

export function SessionCard({ session, onPress }: Props) {
  const dateRef     = session.completed_at ?? session.started_at;
  const dateLabel   = formatRelativeDate(dateRef);
  const timeLabel   = formatTime(session.started_at);
  const templateName = session.template_name ?? 'Quick Workout';
  const duration    = session.duration_seconds ? formatDuration(session.duration_seconds) : '—';
  const volumeLabel = session.volume_kg >= 1000
    ? `${(session.volume_kg / 1000).toFixed(1)}t`
    : `${session.volume_kg} kg`;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.topRow}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <Text style={styles.timeLabel}>{timeLabel}</Text>
        </View>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      </View>

      <Text style={styles.templateName} numberOfLines={1}>{templateName}</Text>

      <View style={styles.statsRow}>
        <Text style={styles.stat}>{session.exercise_count} exercises</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.stat}>{session.total_sets} sets</Text>
        {session.volume_kg > 0 && (
          <>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.stat}>{volumeLabel}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    gap: 6,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dateBlock: { gap: 1 },
  dateLabel: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  timeLabel: { color: '#64748b', fontSize: 12 },
  durationBadge: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  durationText: {
    color: '#a3e635',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  templateName: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  stat: { color: '#64748b', fontSize: 13 },
  dot:  { color: '#334155', fontSize: 13 },
});
