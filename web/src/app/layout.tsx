import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';
import { AuthGate } from '@/components/layout/auth-gate';
import { OfflineProvider } from '@/components/layout/offline-indicator';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liftos.app';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'LiftOS – Gym Tracker',
    template: '%s | LiftOS',
  },
  description:
    'Simple gym tracker with guided progression. Log what you did, see what happened last time, and get a clear next target.',
  keywords: ['gym tracker', 'workout log', 'progressive overload', 'AI fitness', 'strength training'],
  authors: [{ name: 'LiftOS' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LiftOS',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: 'LiftOS',
    title: 'LiftOS – Zero-Friction Gym Tracker',
    description:
      'Log what you did, see what happened last time, and get a clear next target. Works offline.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'LiftOS – AI Gym Tracker',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LiftOS – Zero-Friction Gym Tracker',
    description: 'Log what you did, see what happened last time, and get a clear next target.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#2563EB' },
    { media: '(prefers-color-scheme: light)', color: '#2563EB' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* iOS PWA — must be raw <meta> tags; Next.js appleWebApp covers most */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="LiftOS" />
        {/* Splash screens — iOS 15+ uses the manifest theme_color; older devices */}
        <meta name="msapplication-TileColor" content="#2563EB" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} min-h-[100dvh] antialiased`}>
        <OfflineProvider />
        <AuthGate>
          {children}
        </AuthGate>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
