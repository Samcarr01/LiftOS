import { BottomNav } from '@/components/layout/bottom-nav';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { PwaInstallBanner } from '@/components/layout/pwa-install-banner';

/** Authenticated app shell: sidebar on desktop, bottom nav on mobile. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarNav />
      <main className="flex flex-1 flex-col pb-16 md:pb-0">
        {children}
      </main>
      <PwaInstallBanner />
      <BottomNav />
    </div>
  );
}
