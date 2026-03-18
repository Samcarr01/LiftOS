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
    <nav className="fixed inset-x-0 bottom-3 z-50 px-4 md:hidden">
      <div className="mx-auto flex h-[68px] max-w-md items-center justify-around rounded-2xl border border-white/10 bg-[rgba(9,16,31,0.92)] px-2 shadow-[0_8px_24px_-8px_rgba(2,10,28,0.6)] backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
                'flex min-h-11 min-w-[72px] flex-col items-center justify-center gap-1 rounded-2xl px-3 transition-all duration-300',
                isActive
                  ? 'bg-primary/14 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'text-muted-foreground hover:bg-white/6 hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold tracking-[0.08em]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
