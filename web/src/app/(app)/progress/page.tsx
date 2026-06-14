'use client';

import { useState } from 'react';
import { OverviewTab } from '@/components/progress/overview-tab';
import { ExercisesTab } from '@/components/progress/exercises-tab';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'exercises';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'exercises', label: 'Exercises' },
];

/**
 * Progress hub. Two views behind a segmented control:
 *   • Overview — AI coaching report + 30-day stats (was /progress/weekly)
 *   • Exercises — per-exercise picker, charts, PRs
 */
export default function ProgressPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7">
        <div className="page-header">
          <h1 className="page-header-title">Progress</h1>
        </div>

        {/* Segmented control */}
        <div className="mt-4 flex rounded-xl border border-white/10 bg-black/15 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'h-9 flex-1 rounded-lg text-sm font-semibold transition-colors',
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === 'overview' ? <OverviewTab /> : <ExercisesTab />}
        </div>
      </div>
    </div>
  );
}
