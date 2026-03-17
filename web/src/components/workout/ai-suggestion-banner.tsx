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
  const decisionLabel = progressing ? 'Increase Next Time' : 'Hold Next Time';

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-primary/20 bg-[linear-gradient(135deg,rgba(54,114,255,0.18),rgba(11,20,37,0.92))] px-4 py-4 shadow-[0_8px_24px_-8px_rgba(91,163,255,0.4)]">
      <div className="absolute right-0 top-0 h-24 w-24 bg-[radial-gradient(circle_at_center,rgba(91,163,255,0.22),transparent_70%)]" />

      <div className="relative flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/16 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-xl font-semibold text-foreground">Next Session Guide</p>
            <span className="status-pill border-primary/20 bg-primary/10 text-primary">
              {progressing ? <ArrowUpRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              {decisionLabel}
            </span>
          </div>

          {suggestion.last_result && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Last time:</span> {suggestion.last_result.display}
            </p>
          )}

          {suggestion.next_target && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Next time:</span> {suggestion.next_target.display}
            </p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{suggestion.reason}</p>
        </div>

        <button
          onClick={onDismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label="Hide suggestion"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {suggestion.next_target && (
        <div className="relative mt-4 flex gap-2 border-t border-white/10 pt-4">
          <button
            onClick={onAccept}
            className="premium-button flex-1 justify-center"
          >
            Use Target
          </button>
          <button
            onClick={onDismiss}
            className="premium-button-secondary px-4"
          >
            Hide
          </button>
        </div>
      )}
    </div>
  );
}
