'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface MuscleSplitEntry {
  muscle: string;
  volume: number;
  percentage: number;
}

interface Props {
  data: MuscleSplitEntry[];
}

const COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)', 'var(--chart-9)', 'var(--chart-10)',
];

export function MuscleSplitChart({ data }: Props) {
  const top = data.slice(0, 8);
  const otherVol = data.slice(8).reduce((sum, d) => sum + d.volume, 0);
  const otherPct = data.slice(8).reduce((sum, d) => sum + d.percentage, 0);
  const chartData = otherVol > 0 ? [...top, { muscle: 'Other', volume: otherVol, percentage: otherPct }] : top;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="shrink-0">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={chartData} dataKey="volume" nameKey="muscle" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} strokeWidth={0}>
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--foreground)' }}
              labelStyle={{ color: 'var(--muted-foreground)' }}
              itemStyle={{ color: 'var(--foreground)' }}
              formatter={(v, name) => [`${Math.round(v as number)}kg`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-1">
        {chartData.map((entry, i) => (
          <div key={entry.muscle} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-muted-foreground">{entry.muscle}</span>
            <span className="ml-auto font-semibold">{entry.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
