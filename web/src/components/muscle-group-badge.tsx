import { cn } from '@/lib/utils';

const MUSCLE_COLORS: Record<string, string> = {
  Chest:      'bg-[color:var(--chart-4)]/15 text-[color:var(--chart-4)]',
  Back:       'bg-[color:var(--chart-6)]/15 text-[color:var(--chart-6)]',
  Shoulders:  'bg-[color:var(--chart-3)]/15 text-[color:var(--chart-3)]',
  Biceps:     'bg-[color:var(--chart-2)]/15 text-[color:var(--chart-2)]',
  Triceps:    'bg-[color:var(--chart-7)]/15 text-[color:var(--chart-7)]',
  Legs:       'bg-[color:var(--chart-5)]/15 text-[color:var(--chart-5)]',
  Quads:      'bg-[color:var(--chart-8)]/15 text-[color:var(--chart-8)]',
  Hamstrings: 'bg-[color:var(--chart-6)]/15 text-[color:var(--chart-6)]',
  Glutes:     'bg-[color:var(--chart-5)]/15 text-[color:var(--chart-5)]',
  Core:       'bg-[color:var(--chart-10)]/15 text-[color:var(--chart-10)]',
  Calves:     'bg-[color:var(--chart-10)]/15 text-[color:var(--chart-10)]',
  Cardio:     'bg-[color:var(--chart-4)]/15 text-[color:var(--chart-4)]',
  Forearms:   'bg-[color:var(--chart-3)]/15 text-[color:var(--chart-3)]',
};

/** Title-case a muscle label so seeded lowercase data ("back") and form data
 *  ("Back") render consistently. */
function toTitleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function MuscleGroupBadge({ muscle, className }: { muscle: string; className?: string }) {
  const label = toTitleCase(muscle);
  const color = MUSCLE_COLORS[label] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium', color, className)}>
      {label}
    </span>
  );
}
