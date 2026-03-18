'use client';

import { ArrowUpRight, Minus, Sparkles, X } from 'lucide-react';
import type { AISuggestionData } from '@/types/app';

interface AISuggestionBannerProps {
  suggestion: AISuggestionData;
  onAccept: () => void;
  onDismiss: () => void;
}

export function AISuggestionBanner({
  suggestion,
  onAccept,
  onDismiss,
}: AISuggestionBannerProps) {
  const progressing = suggestion.decision === 'progress';

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.06] px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              {progressing ? 'Progress' : 'Hold'} next time
            </span>
            {progressing
              ? <ArrowUpRight className="h-3 w-3 text-primary" />
              : <Minus className="h-3 w-3 text-muted-foreground" />}
          </div>

          {suggestion.next_target && (
            <p className="mt-1 text-xs text-muted-foreground">
              Target: <span className="font-medium text-foreground">{suggestion.next_target.display}</span>
              {suggestion.last_result && (
                <span> (was {suggestion.last_result.display})</span>
              )}
            </p>
          )}

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{suggestion.reason}</p>
        </div>

        <button
          onClick={onDismiss}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Hide suggestion"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {suggestion.next_target && (
        <div className="mt-2 flex gap-2 border-t border-primary/10 pt-2">
          <button
            onClick={onAccept}
            className="flex h-7 flex-1 items-center justify-center rounded-md bg-primary/12 text-xs font-semibold text-primary active:bg-primary/20"
          >
            Apply Target
          </button>
          <button
            onClick={onDismiss}
            className="flex h-7 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
