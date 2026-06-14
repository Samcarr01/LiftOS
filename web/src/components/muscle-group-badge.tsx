import { cn } from '@/lib/utils';

const MUSCLE_COLORS: Record<string, string> = {
  Chest:      'bg-red-500/15 text-red-300',
  Back:       'bg-blue-500/15 text-blue-300',
  Shoulders:  'bg-yellow-500/15 text-yellow-300',
  Biceps:     'bg-emerald-500/15 text-emerald-300',
  Triceps:    'bg-orange-500/15 text-orange-300',
  Legs:       'bg-purple-500/15 text-purple-300',
  Quads:      'bg-violet-500/15 text-violet-300',
  Hamstrings: 'bg-indigo-500/15 text-indigo-300',
  Glutes:     'bg-pink-500/15 text-pink-300',
  Core:       'bg-cyan-500/15 text-cyan-300',
  Calves:     'bg-teal-500/15 text-teal-300',
  Cardio:     'bg-rose-500/15 text-rose-300',
  Forearms:   'bg-amber-500/15 text-amber-300',
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
  const color = MUSCLE_COLORS[label] ?? 'bg-slate-500/15 text-slate-300';
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium', color, className)}>
      {label}
    </span>
  );
}
