'use client';

import { memo, useCallback } from 'react';
import { Check } from 'lucide-react';
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
  aiTarget?: Record<string, number | string | undefined> | null;
  onUpdate: (patch: { values?: SetValues; setType?: SetEntry['setType'] }) => void;
  onComplete: () => void;
  onDelete: () => void;
  borderless?: boolean;
}

const PROGRESSION_SET_TYPES = new Set(['working', 'top']);

function formatTarget(target: Record<string, number | string | undefined>, fields: TrackingField[]): string {
  const parts = fields.map((field) => {
    const value = target[field.key];
    if (value === undefined || value === '' || value === null) return null;
    if (field.unit === 'kg' || field.unit === 'lb') return `${value}${field.unit}`;
    if (field.unit === 'seconds') return `${value}s`;
    if (field.unit === 'metres') return `${value}m`;
    if (field.unit) return `${value} ${field.unit}`;
    return String(value);
  }).filter(Boolean);

  return parts.join(' × ') || '';
}

export const SetRow = memo(function SetRow({
  set,
  setNumber,
  lastValues,
  fields,
  aiTarget,
  onUpdate,
  onComplete,
  borderless,
}: SetRowProps) {
  const isPrefilled = set.loggedAt === '' && !set.isCompleted;

  const cycleType = useCallback(() => {
    const index = SET_TYPE_CYCLE.indexOf(set.setType);
    const next = SET_TYPE_CYCLE[(index + 1) % SET_TYPE_CYCLE.length];
    onUpdate({ setType: next });
  }, [set.setType, onUpdate]);

  const handleValueChange = useCallback((key: string, value: number | '') => {
    onUpdate({ values: { ...set.values, [key]: value === '' ? 0 : value } });
  }, [set.values, onUpdate]);

  return (
    <div
      className={cn(
        'px-3 py-3 transition-colors duration-150',
        borderless
          ? 'rounded-xl'
          : 'rounded-2xl border border-white/8',
        set.isCompleted && (borderless
          ? 'bg-[oklch(0.72_0.19_155/0.08)]'
          : 'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155/0.12)]'),
        !set.isCompleted && !borderless && isPrefilled && 'border-primary/15',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cycleType}
          title={`${SET_TYPE_NAME[set.setType]} — tap to change`}
          className={cn(
            'flex h-11 w-11 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border text-xs font-bold leading-tight active:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            SET_TYPE_COLOR[set.setType],
          )}
        >
          <span className="text-xs font-semibold">{setNumber}</span>
          <span className="text-xs font-semibold tracking-[0.08em]">{SET_TYPE_LABEL[set.setType]}</span>
        </button>

        <div className="min-w-[60px] shrink-0">
          <p className="text-sm text-muted-foreground">Last</p>
          <p className="text-sm font-medium text-foreground">{lastValues ? formatLast(lastValues, fields) : '—'}</p>
          {aiTarget && !set.isCompleted && PROGRESSION_SET_TYPES.has(set.setType) && (
            <p className="text-[11px] font-medium text-primary/70 truncate">
              {formatTarget(aiTarget, fields)}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-1 gap-1.5">
          {fields.map((field) => (
            <div key={field.key} className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-muted-foreground truncate">{field.label}</span>
              <NumericInput
                value={typeof set.values[field.key] === 'number' ? set.values[field.key] as number : ''}
                onChange={(value) => handleValueChange(field.key, value)}
                field={field}
                disabled={false}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onComplete}
          aria-label={set.isCompleted ? 'Mark set incomplete' : 'Complete set'}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-150',
            set.isCompleted
              ? 'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155)] text-white'
              : 'border-white/10 text-muted-foreground active:bg-primary/10 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground',
          )}
        >
          <Check className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
});
