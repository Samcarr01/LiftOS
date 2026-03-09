/**
 * PlateauWarning — dismissible amber card shown on an exercise card when a
 * plateau has been detected (plateau_flag = true in the cached AI suggestion).
 *
 * Shows stall count + template intervention text. Dismissed per session only
 * (state is local; reappears on next session if plateau persists).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface PlateauWarningProps {
  sessionsStalled: number;
  intervention:    string;
  onDismiss:       () => void;
}

export function PlateauWarning({ sessionsStalled, intervention, onDismiss }: PlateauWarningProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>⚠</Text>
        <Text style={styles.title}>
          Stalled for {sessionsStalled} session{sessionsStalled !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.intervention}>{intervention}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1c1407',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#92400e',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    padding: 10,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 13,
  },
  title: {
    flex: 1,
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
  },
  dismissText: {
    color: '#78350f',
    fontSize: 16,
    lineHeight: 20,
  },
  intervention: {
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 17,
  },
});
