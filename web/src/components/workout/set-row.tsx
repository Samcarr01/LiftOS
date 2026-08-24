'use client';

import { memo, useCallback } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
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
  onUpdate: (setId: string, patch: { values?: SetValues; setType?: SetEntry['setType'] }) => void;
  onComplete: (setId: string) => void;
  onDelete: (setId: string) => void;
  borderless?: boolean;
  /**
   * Show the optional "Final set RIR" line. The caller decides eligibility —
   * only the final completed working/top set of an exercise ever gets it.
   */
  showRir?: boolean;
  onRirChange?: (setId: string, rir: number | null) => void;
}

/** Stored values, with 3 standing for the displayed "3+". */
const RIR_CHOICES: Array<{ value: number; label: string }> = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
];

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
  showRir,
  onRirChange,
}: SetRowProps) {
  const isPrefilled = set.loggedAt === '' && !set.isCompleted;

  const cycleType = useCallback(() => {
    haptic('tap');
    const index = SET_TYPE_CYCLE.indexOf(set.setType);
    const next = SET_TYPE_CYCLE[(index + 1) % SET_TYPE_CYCLE.length];
    onUpdate(set.id, { setType: next });
  }, [set.id, set.setType, onUpdate]);

  const handleValueChange = useCallback((key: string, value: number | '') => {
    onUpdate(set.id, { values: { ...set.values, [key]: value === '' ? 0 : value } });
  }, [set.id, set.values, onUpdate]);

  return (
    <div
      className={cn(
        'px-3 py-3 transition-colors duration-150',
        borderless
          ? 'rounded-xl'
          : 'rounded-2xl border border-white/8',
        set.isCompleted && (borderless
          ? 'state-success'
          : 'state-success'),
        !set.isCompleted && !borderless && isPrefilled && 'border-primary/15',
      )}
    >
      {/* One line at every width. Chip and tick hold their 44px, Last holds a
          fixed compact slot, and the editable fields take what is left and
          shrink into it — a set stays one scannable band on a phone. */}
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
          <span className="flex items-center gap-0.5 text-xs font-semibold tracking-[0.08em]">
            {SET_TYPE_LABEL[set.setType]}
            <ChevronsUpDown className="h-2.5 w-2.5 opacity-70" aria-hidden />
          </span>
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
          onClick={() => onComplete(set.id)}
          aria-label={set.isCompleted ? 'Mark set incomplete' : 'Complete set'}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
            'transition-[background-color,border-color] duration-150',
            'active:scale-[0.88] active:transition-none [touch-action:manipulation]',
            set.isCompleted
              ? 'state-success text-white'
              : 'border-white/20 text-muted-foreground active:bg-primary/35 active:border-primary hover:border-primary/35 hover:bg-primary/10 hover:text-foreground',
          )}
        >
          <Check className="h-5 w-5" />
        </button>
      </div>

      {/* Optional RIR — a second line, never a column beside Last / inputs /
          check. It writes its own `set_entries` column and touches nothing the
          lifter typed: no value handler, no focus, no number pad. */}
      {showRir && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-white/[0.06] pt-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Final set RIR</span>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
            {RIR_CHOICES.map((choice) => {
              const selected = set.rir === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={choice.value === 3 ? 'RIR 3 or more' : `RIR ${choice.value}`}
                  onClick={() => onRirChange?.(set.id, selected ? null : choice.value)}
                  className={cn(
                    'tappable flex h-10 min-w-10 items-center justify-center rounded-xl border px-2 text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    selected
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-white/10 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {choice.label}
                </button>
              );
            })}
            {set.rir !== null && set.rir !== undefined && (
              <button
                type="button"
                onClick={() => onRirChange?.(set.id, null)}
                aria-label="Clear RIR"
                className="tappable flex h-10 items-center justify-center rounded-xl px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
