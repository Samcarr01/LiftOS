'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, ClockArrowUp, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/',           label: 'Home',      icon: Home },
  { href: '/templates',  label: 'Workouts',  icon: Dumbbell },
  { href: '/history',    label: 'History',   icon: ClockArrowUp },
  { href: '/profile',    label: 'Profile',   icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="relative mx-auto flex h-[60px] max-w-md items-center justify-around overflow-hidden rounded-2xl border border-white/[0.07] bg-[oklch(0.14_0.013_264/0.96)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : href === '/templates'
              ? pathname.startsWith('/templates') || pathname.startsWith('/exercises')
              : href === '/history'
                ? pathname.startsWith('/history')
                : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-5 py-1.5 transition-colors duration-150',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className={cn('text-[11px]', isActive ? 'font-semibold' : 'font-medium')}>{label}</span>
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
