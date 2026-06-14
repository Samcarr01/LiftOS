'use client';

import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectableRowProps {
  /** Icon component rendered in the leading container. */
  icon?: LucideIcon;
  /** Custom leading node (e.g. a text badge) — overrides `icon`. */
  iconNode?: React.ReactNode;
  title: string;
  subtitle?: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * The single-column selectable row card used across onboarding steps and the
 * Training Preferences goals list — one consistent control for "pick from a
 * set", whether single- or multi-select.
 */
export function SelectableRow({
  icon: Icon,
  iconNode,
  title,
  subtitle,
  selected,
  onSelect,
  className,
}: SelectableRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex min-h-[64px] w-full cursor-pointer items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.98]',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.07]',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
          selected ? 'bg-primary/20' : 'bg-white/[0.06]',
        )}
      >
        {iconNode ??
          (Icon && (
            <Icon className={cn('h-5 w-5', selected ? 'text-primary-bright' : 'text-muted-foreground')} />
          ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-base font-semibold', selected ? 'text-foreground' : 'text-foreground/90')}>
          {title}
        </p>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {selected && <Check className="h-[18px] w-[18px] shrink-0 text-primary-bright" />}
    </button>
  );
}
