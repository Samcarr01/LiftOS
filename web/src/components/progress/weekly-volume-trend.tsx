'use client';

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useMemo } from 'react';

interface Props {
  data: { week: string; volume: number }[];
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${d.getUTCDate()}`;
}

function formatVolume(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function formatVolumeTooltip(value: number): string {
  return value >= 1000 ? `${value.toLocaleString('en-US')} kg` : `${value}kg`;
}

const CHART_MARGIN = { top: 4, right: 8, bottom: 0, left: 0 };
const AXIS_TICK = { fontSize: 10, fill: 'var(--muted-foreground)' };
const TOOLTIP_CONTENT_STYLE = { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--foreground)' };
const TOOLTIP_LABEL_STYLE = { color: 'var(--muted-foreground)' };
const TOOLTIP_ITEM_STYLE = { color: 'var(--foreground)' };
const AREA_DOT = { r: 4, fill: 'var(--chart-1)', strokeWidth: 0 };
const ACTIVE_DOT = { r: 6 };

export function WeeklyVolumeTrend({ data }: Props) {
  const chartData = useMemo(
    () => data.map((d) => ({ label: formatWeekLabel(d.week), volume: Math.round(d.volume) })),
    [data],
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={chartData} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={45} tickFormatter={formatVolume} />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(v) => [formatVolumeTooltip(v as number), 'Volume']}
        />
        <Area type="monotone" dataKey="volume" stroke="var(--chart-1)" strokeWidth={2} fill="url(#volumeGradient)" dot={AREA_DOT} activeDot={ACTIVE_DOT} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
