import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Disable service worker in dev to avoid caching stale builds
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Silence workspace-root warning when web/ is inside a monorepo
  outputFileTracingRoot: require('path').resolve(__dirname, '../'),

  // Reduce JS bundle: strip console.log in production
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // Strict image domains (none needed — no external images in app)
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Long-lived cache for hashed static assets
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Service worker must not be cached by the browser
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
