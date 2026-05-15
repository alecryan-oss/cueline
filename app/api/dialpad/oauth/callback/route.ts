import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/db/client';
import { upsertDialpadConnection } from '@/lib/db/queries/tenantIntegrations';
import { exchangeCodeForToken, getCurrentUser } from '@/lib/dialpad/client';
import { encryptToken } from '@/lib/dialpad/crypto';
import { callbackRedirectUri, OAUTH_STATE_COOKIE } from '@/lib/dialpad/oauth';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireTenant, UnauthenticatedError } from '@/lib/tenant/context';

export const runtime = 'nodejs';

function back(qs: string): Response {
  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/settings?${qs}`);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // Dialpad redirected back with an error (user denied, scope rejected, etc.)
  if (errorParam) {
    logger.warn({ err: errorParam }, 'dialpad oauth: provider returned error');
    return back(`dialpad_error=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !state) {
    return back('dialpad_error=missing_params');
  }

  // CSRF check.
  const cookieStore = await cookies();
  const stored = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.set(OAUTH_STATE_COOKIE, '', { path: '/api/dialpad/oauth', maxAge: 0 });
  if (!stored || stored !== state) {
    logger.warn({ stored, state }, 'dialpad oauth: state mismatch');
    return back('dialpad_error=state_mismatch');
  }

  // Re-derive tenant from the user's session (never trust query/body).
  let tenantId: string;
  try {
    ({ tenantId } = await requireTenant());
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/sign-in`);
    }
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'dialpad oauth: tenant resolve failed',
    );
    return back('dialpad_error=tenant');
  }

  try {
    const tokens = await exchangeCodeForToken({ code, redirectUri: callbackRedirectUri() });
    const user = await getCurrentUser(tokens.access_token);

    const service = createServiceClient();
    await upsertDialpadConnection(service, tenantId, {
      accessTokenEncrypted: encryptToken(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      dialpadUserId: user.id,
      dialpadUserEmail: user.emails?.[0] ?? null,
      dialpadCompanyId: user.company_id ?? null,
    });

    logger.info(
      { tenantId, dialpad_user_id: user.id, dialpad_company_id: user.company_id },
      'dialpad oauth: connected',
    );
    return back('dialpad=connected');
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), tenantId },
      'dialpad oauth: token exchange / persist failed',
    );
    return back('dialpad_error=oauth_failed');
  }
}
