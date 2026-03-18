'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, ClockArrowUp, User, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/',           label: 'Home',      icon: Home },
  { href: '/templates',  label: 'Workouts',  icon: Dumbbell },
  { href: '/history',    label: 'History',   icon: ClockArrowUp },
  { href: '/profile',    label: 'Profile',   icon: User },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-white/[0.06] bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12">
          <Zap className="h-[18px] w-[18px] text-primary" />
        </div>
        <span className="font-display text-lg font-bold tracking-tight">LiftOS</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
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
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
