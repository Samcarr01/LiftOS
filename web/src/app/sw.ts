import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

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
 * - Static assets (JS, CSS, images, fonts) are cached via defaultCache
 *   so the app shell loads instantly even on terrible wifi.
 *
 * - Navigation fallback: if a page can't be loaded from cache or network,
 *   serve /offline instead of crashing.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting:     true,
  clientsClaim:    true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
