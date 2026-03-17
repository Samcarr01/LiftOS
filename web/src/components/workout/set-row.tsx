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
        'rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,24,42,0.9),rgba(10,18,32,0.86))] px-3 py-3 shadow-[0_24px_60px_-42px_rgba(2,10,28,0.95)] transition-all duration-300',
        set.isCompleted && 'border-primary/20 bg-[linear-gradient(180deg,rgba(17,31,55,0.92),rgba(10,18,32,0.86))]',
        isPrefilled && 'shadow-[0_28px_64px_-46px_rgba(91,163,255,0.9)]',
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="flex items-center gap-3 xl:w-[168px] xl:shrink-0">
          <button
            type="button"
            onClick={cycleType}
            title="Tap to change set type"
            className={cn(
              'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border text-[10px] font-bold leading-tight',
              SET_TYPE_COLOR[set.setType],
            )}
          >
            <span className="text-sm font-semibold">{setNumber}</span>
            <span className="text-[9px] font-semibold tracking-[0.12em]">{SET_TYPE_LABEL[set.setType]}</span>
          </button>

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Set {setNumber}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{SET_TYPE_NAME[set.setType]}</p>
          </div>
        </div>

        <div className="glass-panel flex min-w-[110px] flex-col justify-center px-4 py-3 xl:w-[150px] xl:shrink-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Previous</p>
          <p className="mt-1 text-sm font-medium text-foreground">{lastValues ? formatLast(lastValues, fields) : '—'}</p>
        </div>

        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:grid-cols-none xl:grid-flow-col">
          {fields.map((field) => (
            <div key={field.key} className="flex min-w-[104px] flex-col gap-1">
              <span
                title={formatFieldLabel(field)}
                className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
              >
                {formatFieldLabel(field)}
              </span>
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

        <div className="flex gap-2 xl:w-[174px] xl:shrink-0 xl:flex-col">
          <button
            type="button"
            onClick={onComplete}
            disabled={set.isCompleted}
            className={cn(
              'flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors xl:w-full',
              set.isCompleted
                ? 'border-primary/25 bg-primary text-primary-foreground shadow-[0_18px_36px_-24px_rgba(91,163,255,0.8)]'
                : 'border-white/10 bg-white/[0.04] text-foreground hover:border-primary/35 hover:bg-primary/10',
            )}
          >
            <Check className="h-4 w-4" />
            {set.isCompleted ? 'Saved' : 'Save Set'}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive xl:w-full"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
