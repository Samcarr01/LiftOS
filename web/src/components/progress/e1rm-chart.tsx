'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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
const LINE_DOT = { r: 3, fill: 'var(--chart-1)' };
const ACTIVE_DOT = { r: 5 };

export function E1rmChart({ points }: Props) {
  const data = useMemo(() => points.map((p) => ({
    date: formatChartDate(p.date),
    e1rm: p.e1rm ?? 0,
  })), [points]);

  if (points.length < 2) return <ChartEmptyState message="Log at least 2 sessions to see your e1RM trend." />;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} unit="kg" />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(v) => [`${v}kg`, 'Est. 1RM']}
        />
        <Line type="monotone" dataKey="e1rm" stroke="var(--chart-1)" strokeWidth={2} dot={LINE_DOT} activeDot={ACTIVE_DOT} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
