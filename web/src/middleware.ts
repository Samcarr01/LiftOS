import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');
  const isOnboardingRoute = pathname === '/onboarding';

  let supabaseResponse = NextResponse.next({ request });

  // If Supabase is misconfigured or unreachable, redirect to login (fail closed)
  let user = null;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // getClaims verifies the access token locally after the JWKS has been cached.
    const { data: claimsData } = await supabase.auth.getClaims();
    user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;
  } catch {
    // Supabase unreachable or misconfigured — treat as unauthenticated
    if (!isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Redirect unauthenticated users to /login, except for auth routes
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Onboarding completion is immutable. Avoid a database round-trip on every
  // navigation by recording it only after the onboarding update succeeds.
  if (user && !isAuthRoute && !isOnboardingRoute && request.cookies.get('liftos-onboarded')?.value !== user.id) {
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [{
    // Skip Next.js internals, static files, service worker, SEO routes, RSC,
    // and router prefetches. Document requests remain auth-protected.
    source: '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    missing: [
      { type: 'header', key: 'next-router-prefetch' },
      { type: 'header', key: 'RSC' },
    ],
  }],
};
