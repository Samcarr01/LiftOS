/**
 * VolumeChart — bar chart of total session volume (weight × reps) per session.
 */
import React, { memo } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
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
  color:      (opacity = 1) => `rgba(99, 179, 237, ${opacity})`,   // sky blue
  labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
  propsForBackgroundLines: { strokeDasharray: '', stroke: '#334155', strokeWidth: '1' },
  barPercentage: 0.7,
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

export const VolumeChart = memo(function VolumeChart({ points }: Props) {
  const pts = points.filter((p) => p.volumeKg > 0);

  if (pts.length < MIN_POINTS) {
    return (
      <ChartEmptyState
        message={
          pts.length === 0
            ? 'No volume data — log sets with weight + reps'
            : 'Log at least 2 sessions to see the trend'
        }
      />
    );
  }

  const labels = thinLabels(pts.map((p) => label(p.date)));
  const data   = pts.map((p) => p.volumeKg);

  const avg    = data.reduce((a, b) => a + b, 0) / data.length;
  const latest = data[data.length - 1];
  const vsAvg  = latest - avg;

  return (
    <View>
      <BarChart
        data={{ labels, datasets: [{ data }] }}
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        yAxisLabel=""
        yAxisSuffix=""
        chartConfig={CHART_CONFIG}
        fromZero
        showBarTops={false}
        style={styles.chart}
        withInnerLines
        flatColor
      />
      <View style={styles.caption}>
        <Text style={styles.captionText}>Session volume (kg)</Text>
        <Text style={[styles.delta, vsAvg >= 0 ? styles.pos : styles.neg]}>
          {vsAvg >= 0 ? '▲' : '▼'} {Math.abs(vsAvg).toFixed(0)} kg vs avg
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
