'use client';

import { useLinkStatus } from 'next/link';

/** Must be rendered as a DESCENDANT of the <Link> it reports on. */
export function NavPendingDot({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden
      className={`absolute inset-x-3 bottom-0.5 h-[2px] animate-pulse rounded-full bg-primary ${className}`} />
  );
}
