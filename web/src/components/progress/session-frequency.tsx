'use client';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  activeDays: string[];
}

export function SessionFrequency({ activeDays }: Props) {
  const activeSet = new Set(activeDays);

  return (
    <div className="flex items-center justify-between gap-1 px-2">
      {DAYS.map((day) => {
        const active = activeSet.has(day);
        return (
          <div key={day} className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                active
                  ? 'bg-primary/20 text-primary'
                  : 'bg-white/[0.04] text-muted-foreground/40'
              }`}
            >
              {active ? (
                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-white/[0.08]" />
              )}
            </div>
            <span className={`text-[10px] font-medium ${
              active ? 'text-foreground' : 'text-muted-foreground/50'
            }`}>
              {day}
            </span>
          </div>
        );
      })}
    </div>
  );
}
