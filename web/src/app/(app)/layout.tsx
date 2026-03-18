import { BottomNav } from '@/components/layout/bottom-nav';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { PwaInstallBanner } from '@/components/layout/pwa-install-banner';

/** Authenticated app shell: sidebar on desktop, bottom nav on mobile. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh]">
      <SidebarNav />
      <main className="relative flex flex-1 flex-col pb-24 md:pb-0">
        {children}
      </main>
      <PwaInstallBanner />
      <BottomNav />
    </div>
  );
}
