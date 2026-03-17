'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrackingField } from '@/types/tracking';

interface NumericInputProps {
  value:    number | '';
  onChange: (v: number | '') => void;
  field:    TrackingField;
  disabled?: boolean;
  prefilled?: boolean; // subtle highlight if value was pre-filled from last session
}

/** Step amount for ± buttons based on field unit */
function getStep(field: TrackingField): number {
  if (field.unit === 'kg' || field.unit === 'lb') return 2.5;
  return 1;
}

function getInputLabel(field: TrackingField): string {
  if (!field.unit) return field.label;
  if (field.unit === 'seconds') return `${field.label} in seconds`;
  if (field.unit === 'metres') return `${field.label} in metres`;
  return `${field.label} in ${field.unit}`;
}

// ── Desktop input ─────────────────────────────────────────────────────────────

function DesktopInput({ value, onChange, field, disabled, prefilled }: NumericInputProps) {
  const step = getStep(field);
  const numVal = typeof value === 'number' ? value : 0;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(Math.max(0, Math.round((numVal - step) * 100) / 100))}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        step={step}
        aria-label={getInputLabel(field)}
        value={value === '' ? '' : value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? '' : Number(v));
        }}
        disabled={disabled}
        placeholder="—"
        className={cn(
          'h-9 w-20 rounded-lg border border-input bg-card px-2 text-center text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          prefilled && value !== '' && 'border-primary/40 bg-primary/5',
          disabled && 'opacity-50',
        )}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(Math.round((numVal + step) * 100) / 100)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

// ── Mobile numpad ─────────────────────────────────────────────────────────────

const NUM_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'] as const;

function MobileNumpad({
  field, value, onChange, onClose,
}: {
  field: TrackingField;
  value: number | '';
  onChange: (v: number | '') => void;
  onClose: () => void;
}) {
  const step = getStep(field);
  const [str, setStr] = useState(value === '' ? '' : String(value));

  const addChar = useCallback((ch: string) => {
    setStr((prev) => {
      if (ch === '.' && prev.includes('.')) return prev;
      if (ch === '.' && prev === '') return '0.';
      return prev + ch;
    });
  }, []);

  const backspace = useCallback(() => setStr((prev) => prev.slice(0, -1)), []);

  const adjustStep = useCallback((delta: number) => {
    const n = parseFloat(str) || 0;
    setStr(String(Math.max(0, Math.round((n + delta) * 100) / 100)));
  }, [str]);

  const confirm = useCallback(() => {
    const n = parseFloat(str);
    onChange(isNaN(n) ? '' : n);
    onClose();
  }, [str, onChange, onClose]);

  const displayLabel = field.unit ? `${field.label} (${field.unit})` : field.label;
  const showDecimal  = field.type === 'number' && getStep(field) !== 1;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Numpad panel */}
      <div className="rounded-t-2xl border-t border-border bg-background px-4 pb-safe-area-inset-bottom pt-4">
        {/* Label + display */}
        <p className="mb-2 text-center text-xs font-medium text-muted-foreground">{displayLabel}</p>
        <div
          className="mb-4 flex min-h-14 items-center justify-end rounded-xl bg-muted px-4 text-3xl font-bold tracking-tight"
        >
          {str || <span className="text-muted-foreground">0</span>}
        </div>

        {/* Step buttons */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            className="flex h-12 items-center justify-center rounded-xl bg-secondary text-base font-semibold text-secondary-foreground active:bg-secondary/70"
            onClick={() => adjustStep(-step)}
          >
            − {step}
          </button>
          <button
            className="flex h-12 items-center justify-center rounded-xl bg-secondary text-base font-semibold text-secondary-foreground active:bg-secondary/70"
            onClick={() => adjustStep(step)}
          >
            + {step}
          </button>
        </div>

        {/* Digit grid */}
        <div className="grid grid-cols-3 gap-2">
          {NUM_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => addChar(k)}
              className="flex h-14 items-center justify-center rounded-xl bg-secondary text-2xl font-medium text-secondary-foreground active:bg-secondary/70"
            >
              {k}
            </button>
          ))}
          {/* Bottom row: [0] [.] [✓] */}
          <button
            onClick={() => addChar('0')}
            className="flex h-14 items-center justify-center rounded-xl bg-secondary text-2xl font-medium active:bg-secondary/70"
          >
            0
          </button>
          {showDecimal ? (
            <button
              onClick={() => addChar('.')}
              className="flex h-14 items-center justify-center rounded-xl bg-secondary text-2xl font-medium active:bg-secondary/70"
            >
              .
            </button>
          ) : (
            <button
              onClick={backspace}
              className="flex h-14 items-center justify-center rounded-xl bg-secondary active:bg-secondary/70"
            >
              <Delete className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={confirm}
            className="flex h-14 items-center justify-center rounded-xl bg-primary text-primary-foreground active:bg-primary/80"
          >
            <Check className="h-6 w-6 font-bold" />
          </button>
        </div>

        {/* Backspace row (if decimal mode, we still need backspace) */}
        {showDecimal && (
          <button
            onClick={backspace}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-secondary active:bg-secondary/70"
          >
            <Delete className="h-5 w-5" />
          </button>
        )}

        {/* Safe area spacer */}
        <div className="h-4" />
      </div>
    </div>,
    document.body,
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NumericInput({ value, onChange, field, disabled, prefilled }: NumericInputProps) {
  const [isMobile, setIsMobile]   = useState(false);
  const [mounted,  setMounted]    = useState(false);
  const [numpadOpen, setNumpadOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsMobile(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Before mount: render desktop input (prevents hydration mismatch)
  if (!mounted) {
    return (
      <input
        type="number"
        aria-label={getInputLabel(field)}
        value={value === '' ? '' : value}
        readOnly
        placeholder="—"
        className="h-9 w-20 rounded-lg border border-input bg-card px-2 text-center text-sm font-medium"
      />
    );
  }

  if (!isMobile) {
    return (
      <DesktopInput
        value={value}
        onChange={onChange}
        field={field}
        disabled={disabled}
        prefilled={prefilled}
      />
    );
  }

  // Mobile: tap to open numpad
  const displayValue = value === '' ? null : value;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setNumpadOpen(true)}
        aria-label={getInputLabel(field)}
        title={getInputLabel(field)}
        className={cn(
          'flex min-h-[44px] min-w-[60px] items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-semibold',
          'active:bg-muted transition-colors',
          prefilled && value !== '' && 'border-primary/40 bg-primary/5 text-primary',
          disabled && 'opacity-50',
        )}
      >
        {displayValue === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span>
            {displayValue}
            {field.unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{field.unit}</span>}
          </span>
        )}
      </button>

      {numpadOpen && (
        <MobileNumpad
          field={field}
          value={value}
          onChange={onChange}
          onClose={() => setNumpadOpen(false)}
        />
      )}
    </>
  );
}
