'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[AppError]', error); }, [error]);
  return (
    <div className="page-shell">
      <div className="page-content flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <p className="text-card-title">Couldn&apos;t load this screen</p>
          <p className="mt-1 text-sm text-muted-foreground">Your data is safe. Try again, or use the nav below.</p>
        </div>
        <button onClick={reset} className="premium-button tappable"><RefreshCw className="h-4 w-4" />Try again</button>
      </div>
    </div>
  );
}
