'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, Clock, TrendingUp, User, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/',           label: 'Home',      icon: Home },
  { href: '/templates',  label: 'Templates', icon: Dumbbell },
  { href: '/history',    label: 'History',   icon: Clock },
  { href: '/progress',   label: 'Progress',  icon: TrendingUp },
  { href: '/profile',    label: 'Profile',   icon: User },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <Zap className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold tracking-tight">LiftOS</span>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
