import { BottomNav } from '@/components/layout/bottom-nav';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { PwaInstallBanner } from '@/components/layout/pwa-install-banner';
import { PwaUpdateBanner } from '@/components/layout/pwa-update-banner';

/** Authenticated app shell: sidebar on desktop, bottom nav on mobile. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen">
      <SidebarNav />
      <main className="relative flex flex-1 flex-col pb-24 md:pb-0">
        {children}
      </main>
      <PwaUpdateBanner />
      <PwaInstallBanner />
      <BottomNav />
    </div>
  );
}
