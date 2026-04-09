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

export function E1rmChart({ points }: Props) {
  if (points.length < 2) return <ChartEmptyState message="Log at least 2 sessions to see your e1RM trend." />;

  const data = points.map((p) => ({
    date: formatChartDate(p.date),
    e1rm: p.e1rm ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#a1a1aa' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#a1a1aa' }}
          tickLine={false}
          axisLine={false}
          unit="kg"
        />
        <Tooltip
          contentStyle={{
            background:   '#1c1c2e',
            border:       '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            fontSize:     12,
            color:        '#e4e4e7',
          }}
          labelStyle={{ color: '#a1a1aa' }}
          itemStyle={{ color: '#e4e4e7' }}
          formatter={(v) => [`${v}kg`, 'Est. 1RM']}
        />
        <Line
          type="monotone"
          dataKey="e1rm"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 3, fill: '#f59e0b' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
