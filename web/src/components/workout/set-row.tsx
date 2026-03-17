'use client';

import { Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NumericInput } from './numeric-input';
import type { SetEntry, SetValues } from '@/types/app';
import type { TrackingField } from '@/types/tracking';

// ── Set type cycling ──────────────────────────────────────────────────────────

const SET_TYPE_CYCLE: SetEntry['setType'][] = ['working', 'warmup', 'top', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<SetEntry['setType'], string> = {
  working: 'W',
  warmup:  'Wu',
  top:     'T',
  drop:    'D',
  failure: 'F',
};
const SET_TYPE_COLOR: Record<SetEntry['setType'], string> = {
  working: 'bg-primary/15 text-primary',
  warmup:  'bg-yellow-500/20 text-yellow-400',
  top:     'bg-emerald-500/20 text-emerald-400',
  drop:    'bg-orange-500/20 text-orange-400',
  failure: 'bg-red-500/20 text-red-400',
};

// ── Last values formatter ─────────────────────────────────────────────────────

function formatLast(values: SetValues, fields: TrackingField[]): string {
  const parts = fields.map((f) => {
    const v = values[f.key];
    if (v === undefined || v === '' || v === null) return null;
    if (f.unit === 'kg' || f.unit === 'lb') return `${v}${f.unit}`;
    if (f.unit === 'seconds') return `${v}s`;
    if (f.unit === 'metres')  return `${v}m`;
    if (f.unit)               return `${v} ${f.unit}`;
    return String(v);
  }).filter(Boolean);
  return parts.join(' × ') || '—';
}

// ── SetRow ────────────────────────────────────────────────────────────────────

interface SetRowProps {
  set:           SetEntry;
  setNumber:     number;  // 1-based display index
  lastValues:    SetValues | null; // from last_performance_snapshots
  fields:        TrackingField[];
  onUpdate:      (patch: { values?: SetValues; setType?: SetEntry['setType'] }) => void;
  onComplete:    () => void;
  onDelete:      () => void;
}

export function SetRow({ set, setNumber, lastValues, fields, onUpdate, onComplete, onDelete }: SetRowProps) {
  const isPrefilled = set.loggedAt === '' && !set.isCompleted;

  function cycleType() {
    const idx  = SET_TYPE_CYCLE.indexOf(set.setType);
    const next = SET_TYPE_CYCLE[(idx + 1) % SET_TYPE_CYCLE.length];
    onUpdate({ setType: next });
  }

  function handleValueChange(key: string, v: number | '') {
    onUpdate({ values: { ...set.values, [key]: v === '' ? 0 : v } });
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors',
        set.isCompleted && 'opacity-60',
        isPrefilled && 'bg-primary/5',
      )}
    >
      {/* Set # + type badge */}
      <button
        type="button"
        onClick={cycleType}
        title="Tap to change set type"
        className={cn(
          'flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-0 rounded-lg text-[10px] font-bold leading-tight',
          SET_TYPE_COLOR[set.setType],
        )}
      >
        <span className="text-xs font-semibold">{setNumber}</span>
        <span className="text-[9px] font-medium opacity-70">{SET_TYPE_LABEL[set.setType]}</span>
      </button>

      {/* Last session values */}
      <div className="w-[72px] shrink-0 text-[11px] text-muted-foreground/70 leading-tight truncate">
        {lastValues ? formatLast(lastValues, fields) : '—'}
      </div>

      {/* Current value inputs */}
      <div className="flex flex-1 items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
        {fields.map((f) => (
          <NumericInput
            key={f.key}
            value={typeof set.values[f.key] === 'number' ? set.values[f.key] as number : ''}
            onChange={(v) => handleValueChange(f.key, v)}
            field={f}
            disabled={set.isCompleted}
            prefilled={isPrefilled}
          />
        ))}
      </div>

      {/* Complete checkbox */}
      <button
        type="button"
        onClick={onComplete}
        disabled={set.isCompleted}
        className={cn(
          'flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border-2 transition-colors',
          set.isCompleted
            ? 'border-primary bg-primary/20 text-primary'
            : 'border-border bg-card hover:border-primary/50 hover:bg-primary/10',
        )}
      >
        {set.isCompleted && <Check className="h-5 w-5" />}
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
