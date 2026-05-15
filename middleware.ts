import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/lib/env';

const AUTH_PATHS = new Set(['/sign-in', '/sign-up']);

export async function middleware(request: NextRequest) {
  // Initial response — may be replaced if Supabase mutates cookies during refresh.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the session if needed. Don't replace with
  // getSession() — that doesn't validate the JWT against Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPath = AUTH_PATHS.has(path);

  if (!user && !isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on every page request except static assets and the Dialpad/suggest
  // API endpoints (those do their own auth via service role / JWT).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)'],
};
