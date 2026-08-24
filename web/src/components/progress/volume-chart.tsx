'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useMemo } from 'react';
import { ChartEmptyState } from './chart-empty-state';
import { formatChartDate } from '@/lib/format-date';
import type { ProgressPoint } from '@/hooks/use-progress';

interface Props {
  points: ProgressPoint[];
}

const CHART_MARGIN = { top: 4, right: 8, bottom: 0, left: -20 };
const AXIS_TICK = { fontSize: 10, fill: 'var(--muted-foreground)' };
const TOOLTIP_CONTENT_STYLE = { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--foreground)' };
const TOOLTIP_LABEL_STYLE = { color: 'var(--muted-foreground)' };
const TOOLTIP_ITEM_STYLE = { color: 'var(--foreground)' };
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];

export function VolumeChart({ points }: Props) {
  const data = useMemo(() => points.map((p) => ({
    date: formatChartDate(p.date),
    volume: Math.round(p.volume ?? 0),
  })), [points]);

  if (points.length < 2) return <ChartEmptyState message="Log at least 2 sessions to see volume trend." />;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} unit="kg" />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(v) => [`${v}kg`, 'Volume']}
        />
        <Bar dataKey="volume" fill="var(--chart-3)" radius={BAR_RADIUS} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
