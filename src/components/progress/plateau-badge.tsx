/**
 * PlateauBadge — shown on the Progress screen below the exercise selector
 * when the selected exercise has an active plateau flag in ai_suggestions.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PlateauBadgeProps {
  sessionsStalled:  number;
  intervention:     string;
}

export function PlateauBadge({ sessionsStalled, intervention }: PlateauBadgeProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>⚠</Text>
        <Text style={styles.title}>
          Plateau · stalled for {sessionsStalled} session{sessionsStalled !== 1 ? 's' : ''}
        </Text>
      </View>
      <Text style={styles.intervention}>{intervention}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1c1407',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#92400e',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    padding: 12,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 14,
  },
  title: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
  },
  intervention: {
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: 20,
  },
});
