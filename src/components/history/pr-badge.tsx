import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label?: string;
}

export function PRBadge({ label }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.icon}>🏆</Text>
      <Text style={styles.text}>{label ?? 'PR'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2e0a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
    alignSelf: 'flex-start',
  },
  icon: { fontSize: 11 },
  text: {
    color: '#a3e635',
    fontSize: 11,
    fontWeight: '700',
  },
});
