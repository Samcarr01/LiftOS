'use client';

import { Sparkles, X, ArrowUpRight, Minus } from 'lucide-react';
import type { AISuggestionData } from '@/types/app';

interface AISuggestionBannerProps {
  suggestion: AISuggestionData;
  onAccept:   () => void;
  onDismiss:  () => void;
}

export function AISuggestionBanner({ suggestion, onAccept, onDismiss }: AISuggestionBannerProps) {
  const decisionLabel = suggestion.decision === 'progress' ? 'Increase Next Time' : 'Hold Next Time';
  const decisionIcon = suggestion.decision === 'progress'
    ? <ArrowUpRight className="h-3.5 w-3.5" />
    : <Minus className="h-3.5 w-3.5" />;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Next Session Guide</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {decisionIcon}
              {decisionLabel}
            </span>
          </div>

          {suggestion.last_result && (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Last time:</span> {suggestion.last_result.display}
            </p>
          )}

          {suggestion.next_target && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Next time:</span> {suggestion.next_target.display}
            </p>
          )}

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{suggestion.reason}</p>
        </div>

        <button
          onClick={onDismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Hide suggestion"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {suggestion.next_target && (
        <div className="mt-3 flex gap-2 border-t border-primary/20 pt-3">
          <button
            onClick={onAccept}
            className="flex h-10 flex-1 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Use Target
          </button>
          <button
            onClick={onDismiss}
            className="flex h-10 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-card"
          >
            Hide
          </button>
        </div>
      )}
    </div>
  );
}
