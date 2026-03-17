'use client';

import { useState } from 'react';
import { Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { AISuggestionData } from '@/types/app';
import { cn } from '@/lib/utils';

interface AISuggestionBannerProps {
  suggestion: AISuggestionData;
  onAccept:   () => void;
  onDismiss:  () => void;
}

function formatTarget(s: AISuggestionData['primary']): string {
  const parts: string[] = [];
  if (s.weight   !== undefined) parts.push(`${s.weight} kg`);
  if (s.reps     !== undefined) parts.push(`${s.reps} reps`);
  if (s.duration !== undefined) parts.push(`${s.duration}s`);
  if (s.distance !== undefined) parts.push(`${s.distance}m`);
  return parts.join(' × ');
}

export function AISuggestionBanner({ suggestion, onAccept, onDismiss }: AISuggestionBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const target = formatTarget(suggestion.primary);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />

        <div className="flex flex-1 min-w-0 flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">AI Target</p>
          <p className="text-sm font-bold text-foreground truncate">{target || '—'}</p>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <button
          onClick={onAccept}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
        >
          Accept
        </button>

        <button
          onClick={onDismiss}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Rationale */}
      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-primary/20 pt-2">
          <p className="text-xs text-muted-foreground">{suggestion.primary.rationale}</p>

          {suggestion.alternative && (
            <p className="text-xs text-muted-foreground/70">
              Alt: {formatTarget(suggestion.alternative)} — {suggestion.alternative.rationale}
            </p>
          )}

          {suggestion.plateau_flag && suggestion.plateau_intervention && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-2">
              <p className="text-xs font-medium text-yellow-400">
                Plateau detected ({suggestion.plateau_sessions_stalled ?? '?'} sessions)
              </p>
              <p className="mt-0.5 text-xs text-yellow-300/80">{suggestion.plateau_intervention}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
