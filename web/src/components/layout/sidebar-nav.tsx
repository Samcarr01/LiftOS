'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, TrendingUp, User, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/',           label: 'Home',      icon: Home },
  { href: '/templates',  label: 'Workouts',  icon: Dumbbell },
  { href: '/progress',   label: 'Progress',  icon: TrendingUp },
  { href: '/profile',    label: 'Profile',   icon: User },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-white/8 bg-[linear-gradient(180deg,rgba(8,14,28,0.96),rgba(11,18,34,0.92))] md:flex">
      {/* Logo */}
      <div className="relative flex h-24 items-center gap-3 border-b border-white/8 px-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/14 shadow-[0_18px_36px_-18px_rgba(91,163,255,0.75)]">
          <Zap className="h-6 w-6 text-primary" />
        </div>
        <div>
          <span className="font-display text-xl font-bold tracking-tight">LiftOS</span>
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-muted-foreground">Premium Athlete</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex flex-1 flex-col gap-2 px-4 py-6">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : href === '/templates'
              ? pathname.startsWith('/templates') || pathname.startsWith('/exercises')
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-300',
                isActive
                  ? 'bg-primary/12 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-sidebar-foreground hover:bg-white/5 hover:text-sidebar-accent-foreground',
              )}
            >
              <div className={cn(
                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
                isActive ? 'bg-primary/14 text-primary' : 'bg-white/5 text-muted-foreground group-hover:text-foreground',
              )}>
                <Icon className="h-4 w-4 flex-shrink-0" />
              </div>
              <div className="flex flex-1 items-center justify-between">
                <span>{label}</span>
                {isActive && <span className="status-pill border-primary/20 bg-primary/10 text-primary">Open</span>}
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
