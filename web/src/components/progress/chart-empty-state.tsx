'use client';

import { BarChart2 } from 'lucide-react';

export function ChartEmptyState({ message = 'Not enough data yet.' }: { message?: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-muted/50">
      <BarChart2 className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
