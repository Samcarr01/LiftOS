'use client';

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface Props {
  data: { week: string; volume: number }[];
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${d.getUTCDate()}`;
}

export function WeeklyVolumeTrend({ data }: Props) {
  const chartData = data.map((d) => ({
    label:  formatWeekLabel(d.week),
    volume: Math.round(d.volume),
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.75 0.18 55)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="oklch(0.75 0.18 55)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
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
          formatter={(v) => [`${v}kg`, 'Volume']}
        />
        <Area
          type="monotone"
          dataKey="volume"
          stroke="oklch(0.75 0.18 55)"
          strokeWidth={2}
          fill="url(#volumeGradient)"
          dot={{ r: 4, fill: 'oklch(0.75 0.18 55)', strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
