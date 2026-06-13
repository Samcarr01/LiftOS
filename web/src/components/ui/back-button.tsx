'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  /** Navigate to a specific route. Renders a Link. */
  href?: string;
  /** Custom click handler. Overrides the default `router.back()`. Ignored when `href` is set. */
  onClick?: () => void;
  /** Accessible label. Defaults to "Go back". */
  label?: string;
  className?: string;
}

const baseClass =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-muted-foreground backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * Standard back-navigation control: a small circular ghost button with a
 * ChevronLeft icon. Pass `href` to link to a route, or `onClick` for custom
 * behaviour. With neither, it calls `router.back()`.
 */
export function BackButton({ href, onClick, label = 'Go back', className }: BackButtonProps) {
  const router = useRouter();

  if (href) {
    return (
      <Link href={href} aria-label={label} className={cn(baseClass, className)}>
        <ChevronLeft className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick ?? (() => router.back())}
      aria-label={label}
      className={cn('cursor-pointer', baseClass, className)}
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
  );
}
