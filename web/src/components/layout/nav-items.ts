/**
 * Shared primary-navigation definition used by both the mobile bottom nav and
 * the desktop sidebar so the two never drift. Icons are referenced by name and
 * resolved in each consumer (keeps this module free of JSX).
 */
export type NavIconName = 'Home' | 'Dumbbell' | 'TrendingUp' | 'ClockArrowUp' | 'User';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/',          label: 'Home',     icon: 'Home' },
  { href: '/templates', label: 'Workouts', icon: 'Dumbbell' },
  { href: '/progress',  label: 'Progress', icon: 'TrendingUp' },
  { href: '/history',   label: 'Log',      icon: 'ClockArrowUp' },
  { href: '/profile',   label: 'Profile',  icon: 'User' },
] as const;

/**
 * Active-tab resolution:
 *   /, exact                                  → Home
 *   /templates*, /exercises*                  → Workouts
 *   /progress*                                → Progress
 *   /history*                                 → Log
 *   /profile*                                 → Profile
 *   /help, /levels                            → no tab (sub-pages of Profile)
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  switch (href) {
    case '/':
      return pathname === '/';
    case '/templates':
      return pathname.startsWith('/templates') || pathname.startsWith('/exercises');
    case '/progress':
      return pathname.startsWith('/progress');
    case '/history':
      return pathname.startsWith('/history');
    case '/profile':
      return pathname.startsWith('/profile');
    default:
      return pathname.startsWith(href);
  }
}
