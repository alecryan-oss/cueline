// Thin REST client wrapper around the Dialpad public API.
// Used by the OAuth callback handler today; later by the WS relay for
// subscription management + token refresh.
//
// Per docs/dialpad-integration.md the rate limit is 20 req/s per company —
// fine for our usage (one /users/me + one subscription create per OAuth).

import { z } from 'zod';

import { env } from '@/lib/env';

export class DialpadApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'DialpadApiError';
  }
}

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});
export type DialpadTokenResponse = z.infer<typeof TokenResponseSchema>;

/** Exchange the OAuth authorization code for an access + refresh token. */
export async function exchangeCodeForToken({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<DialpadTokenResponse> {
  const res = await fetch(`${env.DIALPAD_OAUTH_BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: env.DIALPAD_CLIENT_ID,
      client_secret: env.DIALPAD_CLIENT_SECRET,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new DialpadApiError(res.status, `token exchange failed: ${text}`, text);
  }
  return TokenResponseSchema.parse(JSON.parse(text));
}

/** Trade a refresh_token for a fresh access_token. */
export async function refreshAccessToken({
  refreshToken,
}: {
  refreshToken: string;
}): Promise<DialpadTokenResponse> {
  const res = await fetch(`${env.DIALPAD_OAUTH_BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.DIALPAD_CLIENT_ID,
      client_secret: env.DIALPAD_CLIENT_SECRET,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new DialpadApiError(res.status, `token refresh failed: ${text}`, text);
  }
  return TokenResponseSchema.parse(JSON.parse(text));
}

const CurrentUserSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  company_id: z.union([z.string(), z.number()]).transform(String).optional(),
  emails: z.array(z.string()).optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  display_name: z.string().optional(),
});
export type DialpadCurrentUser = z.infer<typeof CurrentUserSchema>;

/** GET /api/v2/users/me — identifies the user who just authorized. */
export async function getCurrentUser(accessToken: string): Promise<DialpadCurrentUser> {
  const res = await fetch(`${env.DIALPAD_API_BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new DialpadApiError(res.status, `users/me failed: ${text}`, text);
  }
  return CurrentUserSchema.parse(JSON.parse(text));
}

/**
 * Best-effort token revocation. Dialpad's revoke endpoint may 404 / 405
 * depending on the OAuth app config; we swallow non-fatal errors so a user
 * can always disconnect locally even if the remote revoke fails.
 */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    await fetch(`${env.DIALPAD_OAUTH_BASE_URL}/oauth2/deauthorize`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      },
      body: new URLSearchParams({
        client_id: env.DIALPAD_CLIENT_ID,
        client_secret: env.DIALPAD_CLIENT_SECRET,
        token: accessToken,
      }),
    });
  } catch {
    // Non-fatal — local disconnect proceeds regardless.
  }
}
