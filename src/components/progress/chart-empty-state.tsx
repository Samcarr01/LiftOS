import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  message: string;
}

export function ChartEmptyState({ message }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📈</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  icon:    { fontSize: 32 },
  message: { color: '#475569', fontSize: 14, textAlign: 'center', maxWidth: 220 },
});
