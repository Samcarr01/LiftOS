'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { ChartEmptyState } from './chart-empty-state';
import { formatChartDate } from '@/lib/format-date';
import type { ProgressPoint } from '@/hooks/use-progress';

interface Props {
  points: ProgressPoint[];
}

export function TopSetChart({ points }: Props) {
  if (points.length < 2) return <ChartEmptyState message="Log at least 2 sessions to see a trend." />;

  const data = points.map((p) => ({
    date:   formatChartDate(p.date),
    weight: p.weight ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          unit="kg"
        />
        <Tooltip
          contentStyle={{
            background:   'hsl(var(--popover))',
            border:       '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize:     12,
          }}
          labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
          formatter={(v) => [`${v}kg`, 'Top set']}
        />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#84cc16"
          strokeWidth={2}
          dot={{ r: 3, fill: '#84cc16' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
