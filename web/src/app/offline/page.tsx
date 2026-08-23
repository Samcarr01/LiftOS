'use client';

import { WifiOff } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

export default function OfflinePage() {
  return (
    <PageShell className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/[0.12]">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="page-header-title normal-case text-center">
        You&apos;re Offline
      </h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Check your connection and try again. Your logged sets are saved locally and will sync when you&apos;re back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Try Again
      </button>
    </PageShell>
  );
}
