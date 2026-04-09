'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { ChartEmptyState } from './chart-empty-state';
import { formatChartDate } from '@/lib/format-date';
import type { ProgressPoint } from '@/hooks/use-progress';

interface Props {
  points: ProgressPoint[];
}

export function VolumeChart({ points }: Props) {
  if (points.length < 2) return <ChartEmptyState message="Log at least 2 sessions to see volume trend." />;

  const data = points.map((p) => ({
    date:   formatChartDate(p.date),
    volume: Math.round(p.volume ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
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
          formatter={(v) => [`${v}kg`, 'Volume']}
        />
        <Bar dataKey="volume" fill="#38bdf8" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
