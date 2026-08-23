import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker strategy:
 *
 * - Supabase API calls are NOT intercepted. The browser handles them
 *   normally and the app's own error handling (try/catch in hooks,
 *   IndexedDB offline queue) deals with failures. This prevents the
 *   service worker from crashing on slow/bad wifi.
 *
 * - Hashed Next static chunks use a long-lived CacheFirst cache, matching
 *   their immutable HTTP cache header. Other static assets use defaultCache.
 *
 * - Navigation fallback: if a page can't be loaded from cache or network,
 *   serve the precached static /offline.html instead of crashing.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Supabase cache keys ignore Authorization, so no Supabase response may
    // enter Cache Storage. This must precede defaultCache's cross-origin rule.
    {
      matcher: ({ url }) => url.hostname.endsWith(".supabase.co"),
      handler: new NetworkOnly(),
    },
    // Next content-hashes make these chunks safe to retain for a year.
    {
      matcher: /\/_next\/static\//i,
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 31536000 }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
