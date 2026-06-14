'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, TrendingUp, ClockArrowUp, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNavItemActive, NAV_ITEMS } from './nav-items';

const ICONS = { Home, Dumbbell, TrendingUp, ClockArrowUp, User } as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="relative mx-auto flex h-14 max-w-md items-center justify-around overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.06] backdrop-blur-2xl saturate-150">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const Icon = ICONS[icon];
          const isActive = isNavItemActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={cn(
                'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                isActive
                  ? 'text-primary-bright'
                  : 'text-muted-foreground active:text-foreground',
              )}
            >
              <Icon className="h-[22px] w-[22px]" />
              <span className={cn('text-[11px] leading-none', isActive ? 'font-semibold' : 'font-medium')}>{label}</span>
              {isActive && (
                <span className="absolute bottom-0.5 h-1 w-5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
