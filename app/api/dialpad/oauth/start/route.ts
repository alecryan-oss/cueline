import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  buildAuthorizeUrl,
  callbackRedirectUri,
  generateState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_S,
} from '@/lib/dialpad/oauth';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireTenant, UnauthenticatedError } from '@/lib/tenant/context';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  // Auth-gate the OAuth initiator. Only signed-in users can start a connect.
  try {
    await requireTenant();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/sign-in`);
    }
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'oauth/start: requireTenant failed',
    );
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/settings?error=tenant`);
  }

  const state = generateState();
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: OAUTH_STATE_MAX_AGE_S,
    path: '/api/dialpad/oauth',
  });

  const authorizeUrl = buildAuthorizeUrl({
    state,
    redirectUri: callbackRedirectUri(),
  });
  return NextResponse.redirect(authorizeUrl);
}
