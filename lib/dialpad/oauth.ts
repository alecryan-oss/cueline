// Dialpad OAuth 2.0 helpers (per docs/dialpad-integration.md).
//
// Standard 3-legged authorization-code flow with state CSRF cookie.
// User-centric — each user authorizes individually, no admin install.

import { randomBytes } from 'node:crypto';

import { env } from '@/lib/env';

/**
 * Scopes requested at OAuth time.
 *
 * `calls:list` is in the public scope list and lets us verify the connection
 * works (call /api/v2/users/me, list calls). The crucial `call_transcription`
 * scope (for live transcript event subscriptions) is **gated by Dialpad** —
 * email [email protected] to get it added to your OAuth app, then
 * include it here. See docs/dialpad-integration.md.
 *
 * `offline_access` is required to receive a refresh_token in the response.
 */
export const DIALPAD_SCOPES = ['calls:list', 'offline_access'] as const;

export const OAUTH_STATE_COOKIE = 'dialpad_oauth_state';
export const OAUTH_STATE_MAX_AGE_S = 600; // 10 minutes

export function generateState(): string {
  return randomBytes(32).toString('hex');
}

export function buildAuthorizeUrl({
  state,
  redirectUri,
  scopes = DIALPAD_SCOPES,
}: {
  state: string;
  redirectUri: string;
  scopes?: readonly string[];
}): string {
  const url = new URL(`${env.DIALPAD_OAUTH_BASE_URL}/oauth2/authorize`);
  url.searchParams.set('client_id', env.DIALPAD_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export function callbackRedirectUri(): string {
  // Built from NEXT_PUBLIC_APP_URL so prod uses the deploy URL and dev uses
  // localhost. The Dialpad app config must list both.
  return `${env.NEXT_PUBLIC_APP_URL}/api/dialpad/oauth/callback`;
}
