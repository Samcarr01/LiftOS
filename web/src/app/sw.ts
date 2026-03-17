import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Custom runtime caching strategy for Supabase.
 *
 * - Auth + Edge Functions → NetworkOnly (mutations/auth, never cache)
 * - REST API GET → NetworkFirst (5s timeout, fallback to cache for offline reads)
 *   Enables offline browsing of exercises, templates, and last performance data
 *   that was previously fetched when the user was online.
 *
 * NOTE: Both rules must appear BEFORE defaultCache so they take priority.
 */
const supabaseCaching: RuntimeCaching[] = [
  {
    // Auth and Edge Functions are always network-only
    matcher: /supabase\.co\/(auth|functions)\/v1\//,
    handler: new NetworkOnly(),
  },
  {
    // REST GET → network first, cache as fallback
    matcher: /supabase\.co\/rest\/v1\//,
    handler: new NetworkFirst({
      cacheName:            'supabase-rest-v1',
      networkTimeoutSeconds: 5,
    }),
    method: 'GET',
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting:     true,
  clientsClaim:    true,
  navigationPreload: true,
  runtimeCaching: [...supabaseCaching, ...defaultCache],
});

serwist.addEventListeners();
