/**
 * E1RMChart — line chart of estimated 1RM (Epley) per session.
 */
import React, { memo } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { ChartEmptyState } from './chart-empty-state';
import type { ProgressPoint } from '@/hooks/use-progress';

const CHART_WIDTH  = Dimensions.get('window').width - 32;
const CHART_HEIGHT = 200;
const MIN_POINTS   = 2;

const CHART_CONFIG = {
  backgroundColor:        '#1e293b',
  backgroundGradientFrom: '#1e293b',
  backgroundGradientTo:   '#1e293b',
  decimalPlaces:          0,
  color:      (opacity = 1) => `rgba(251, 191, 36, ${opacity})`,   // amber
  labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
  propsForDots: { r: '5', strokeWidth: '2', stroke: '#d97706', fill: '#fbbf24' },
  propsForBackgroundLines: { strokeDasharray: '', stroke: '#334155', strokeWidth: '1' },
};

function label(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function thinLabels(labels: string[], max = 7): string[] {
  if (labels.length <= max) return labels;
  const step = Math.ceil(labels.length / max);
  return labels.map((l, i) => (i % step === 0 ? l : ''));
}

interface Props { points: ProgressPoint[] }

export const E1RMChart = memo(function E1RMChart({ points }: Props) {
  const pts = points.filter((p) => p.e1rm > 0);

  if (pts.length < MIN_POINTS) {
    return (
      <ChartEmptyState
        message={
          pts.length === 0
            ? 'E1RM requires weight + reps fields'
            : 'Log at least 2 sessions to see the trend'
        }
      />
    );
  }

  const labels = thinLabels(pts.map((p) => label(p.date)));
  const data   = pts.map((p) => p.e1rm);
  const delta  = data[data.length - 1] - data[0];

  return (
    <View>
      <LineChart
        data={{ labels, datasets: [{ data }] }}
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        chartConfig={CHART_CONFIG}
        bezier
        withShadow={false}
        withInnerLines
        style={styles.chart}
        formatYLabel={(v) => `${Math.round(Number(v))}`}
      />
      <View style={styles.caption}>
        <Text style={styles.captionText}>Estimated 1RM — Epley formula (kg)</Text>
        <Text style={[styles.delta, delta >= 0 ? styles.pos : styles.neg]}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)} kg over period
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  chart:       { borderRadius: 12, alignSelf: 'center' },
  caption:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  captionText: { color: '#475569', fontSize: 12 },
  delta:       { fontSize: 12, fontWeight: '600' },
  pos:         { color: '#a3e635' },
  neg:         { color: '#f87171' },
});
