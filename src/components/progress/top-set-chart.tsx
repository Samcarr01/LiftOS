/**
 * TopSetChart — line chart of heaviest working/top set weight per session.
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
  decimalPlaces:          1,
  color:       (opacity = 1) => `rgba(163, 230, 53, ${opacity})`,
  labelColor:  (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
  propsForDots: { r: '5', strokeWidth: '2', stroke: '#84cc16', fill: '#a3e635' },
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

export const TopSetChart = memo(function TopSetChart({ points }: Props) {
  const pts = points.filter((p) => p.topWeight > 0);

  if (pts.length < MIN_POINTS) {
    return (
      <ChartEmptyState
        message={
          pts.length === 0
            ? 'No weight data — log sets with a weight field'
            : 'Log at least 2 sessions to see the trend'
        }
      />
    );
  }

  const labels = thinLabels(pts.map((p) => label(p.date)));
  const data   = pts.map((p) => p.topWeight);
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
        formatYLabel={(v) => `${Number(v).toFixed(1)}`}
      />
      <View style={styles.caption}>
        <Text style={styles.captionText}>Top set weight (kg)</Text>
        <Text style={[styles.delta, delta >= 0 ? styles.pos : styles.neg]}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} kg over period
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
