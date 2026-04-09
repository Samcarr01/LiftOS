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
  'oklch(0.75 0.18 55)',   // orange (primary)
  'oklch(0.72 0.19 155)',  // green
  'oklch(0.72 0.15 250)',  // blue
  'oklch(0.80 0.16 85)',   // gold
  'oklch(0.65 0.20 330)',  // pink
  'oklch(0.70 0.14 200)',  // teal
  'oklch(0.65 0.16 30)',   // red-orange
  'oklch(0.70 0.12 280)',  // purple
  'oklch(0.78 0.10 100)',  // lime
  'oklch(0.60 0.14 180)',  // cyan
];

export function MuscleSplitChart({ data }: Props) {
  const top = data.slice(0, 8);
  const otherVol = data.slice(8).reduce((sum, d) => sum + d.volume, 0);
  const otherPct = data.slice(8).reduce((sum, d) => sum + d.percentage, 0);
  const chartData = otherVol > 0
    ? [...top, { muscle: 'Other', volume: otherVol, percentage: otherPct }]
    : top;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="shrink-0">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="volume"
              nameKey="muscle"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
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
              formatter={(v, name) => [`${Math.round(v as number)}kg`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-1">
        {chartData.map((entry, i) => (
          <div key={entry.muscle} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="text-muted-foreground">{entry.muscle}</span>
            <span className="ml-auto font-semibold">{entry.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
