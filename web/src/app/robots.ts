import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liftos.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Block authenticated app routes from indexing — they're behind auth anyway
        disallow: ['/workout/', '/history/', '/templates/', '/progress/', '/profile/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
