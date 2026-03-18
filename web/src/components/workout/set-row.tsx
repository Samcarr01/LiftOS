'use client';

import { Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NumericInput } from './numeric-input';
import type { SetEntry, SetValues } from '@/types/app';
import type { TrackingField } from '@/types/tracking';

const SET_TYPE_CYCLE: SetEntry['setType'][] = ['working', 'warmup', 'top', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<SetEntry['setType'], string> = {
  working: 'W',
  warmup: 'WU',
  top: 'T',
  drop: 'D',
  failure: 'F',
};
const SET_TYPE_NAME: Record<SetEntry['setType'], string> = {
  working: 'Working',
  warmup: 'Warm Up',
  top: 'Top',
  drop: 'Drop',
  failure: 'Failure',
};
const SET_TYPE_COLOR: Record<SetEntry['setType'], string> = {
  working: 'bg-primary/14 text-primary border-primary/20',
  warmup: 'bg-yellow-500/12 text-yellow-300 border-yellow-500/20',
  top: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
  drop: 'bg-orange-500/12 text-orange-300 border-orange-500/20',
  failure: 'bg-red-500/12 text-red-300 border-red-500/20',
};

function formatFieldLabel(field: TrackingField): string {
  if (!field.unit) return field.label;
  if (field.unit === 'seconds') return `${field.label} (sec)`;
  if (field.unit === 'metres') return `${field.label} (m)`;
  return `${field.label} (${field.unit})`;
}

function formatLast(values: SetValues, fields: TrackingField[]): string {
  const parts = fields.map((field) => {
    const value = values[field.key];
    if (value === undefined || value === '' || value === null) return null;
    if (field.unit === 'kg' || field.unit === 'lb') return `${value}${field.unit}`;
    if (field.unit === 'seconds') return `${value}s`;
    if (field.unit === 'metres') return `${value}m`;
    if (field.unit) return `${value} ${field.unit}`;
    return String(value);
  }).filter(Boolean);

  return parts.join(' × ') || '—';
}

interface SetRowProps {
  set: SetEntry;
  setNumber: number;
  lastValues: SetValues | null;
  fields: TrackingField[];
  onUpdate: (patch: { values?: SetValues; setType?: SetEntry['setType'] }) => void;
  onComplete: () => void;
  onDelete: () => void;
}

export function SetRow({
  set,
  setNumber,
  lastValues,
  fields,
  onUpdate,
  onComplete,
  onDelete,
}: SetRowProps) {
  const isPrefilled = set.loggedAt === '' && !set.isCompleted;

  function cycleType() {
    const index = SET_TYPE_CYCLE.indexOf(set.setType);
    const next = SET_TYPE_CYCLE[(index + 1) % SET_TYPE_CYCLE.length];
    onUpdate({ setType: next });
  }

  function handleValueChange(key: string, value: number | '') {
    onUpdate({ values: { ...set.values, [key]: value === '' ? 0 : value } });
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-white/8 px-3 py-2.5 transition-all duration-200',
        set.isCompleted && 'border-primary/20 bg-primary/5',
        isPrefilled && 'border-primary/15',
      )}
    >
      {/* Row 1: set badge, previous, inputs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cycleType}
          title={`${SET_TYPE_NAME[set.setType]} — tap to change`}
          className={cn(
            'flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg border text-[10px] font-bold leading-tight',
            SET_TYPE_COLOR[set.setType],
          )}
        >
          <span className="text-xs font-semibold">{setNumber}</span>
          <span className="text-[8px] font-semibold tracking-[0.08em]">{SET_TYPE_LABEL[set.setType]}</span>
        </button>

        <div className="min-w-[60px] shrink-0">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Last</p>
          <p className="text-xs font-medium text-foreground">{lastValues ? formatLast(lastValues, fields) : '—'}</p>
        </div>

        <div className="flex min-w-0 flex-1 gap-1.5">
          {fields.map((field) => (
            <div key={field.key} className="min-w-0 flex-1">
              <span className="block text-[9px] uppercase tracking-wider text-muted-foreground truncate">{field.label}</span>
              <NumericInput
                value={typeof set.values[field.key] === 'number' ? set.values[field.key] as number : ''}
                onChange={(value) => handleValueChange(field.key, value)}
                field={field}
                disabled={set.isCompleted}
                prefilled={isPrefilled}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onComplete}
          disabled={set.isCompleted}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
            set.isCompleted
              ? 'border-primary/25 bg-primary text-primary-foreground'
              : 'border-white/10 text-muted-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-foreground',
          )}
        >
          <Check className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/8 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
