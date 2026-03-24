import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');
  const isOnboardingRoute = pathname === '/onboarding';

  let supabaseResponse = NextResponse.next({ request });

  // If Supabase is misconfigured or unreachable, redirect to login (fail closed)
  let supabase = null;
  let user = null;
  try {
    supabase = createServerClient(
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

    // Refresh session — must call getUser() (not getSession()) per @supabase/ssr docs
    const { data } = await supabase.auth.getUser();
    user = data.user;
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

  // Check onboarding status for authenticated users on non-onboarding routes
  if (user && supabase && !isAuthRoute && !isOnboardingRoute) {
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();

      if (userRow && !userRow.onboarding_completed) {
        const url = request.nextUrl.clone();
        url.pathname = '/onboarding';
        return NextResponse.redirect(url);
      }
    } catch {
      // If we can't check onboarding status, let them through
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, service worker, and SEO routes
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
