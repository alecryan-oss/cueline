import {
  createBrowserClient as _createBrowserClient,
  createServerClient as _createServerClient,
} from '@supabase/ssr';
import { createClient as _createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { cookies } from 'next/headers';

import { env } from '@/lib/env';
import type { Database } from './database.types';

export type DbClient = SupabaseClient<Database>;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Browser-side Supabase client. Uses the anon key. RLS enforces tenant
 * isolation based on the user's JWT.
 *
 * Use in Client Components only.
 */
export function createBrowserClient(): DbClient {
  return _createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Server-side Supabase client backed by the user's session cookies. Uses the
 * anon key — RLS still applies based on the user's JWT.
 *
 * Use in Server Actions, Route Handlers serving the browser, and RSCs. Pass
 * the cookie store from `await cookies()` (next/headers).
 */
export function createServerClient(cookieStore: CookieStore): DbClient {
  return _createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot mutate cookies. Safe to ignore — the
            // session refresh middleware handles persistence.
          }
        },
      },
    },
  );
}

/**
 * Service-role Supabase client. **BYPASSES RLS.**
 *
 * Permitted callers ONLY:
 *   1. The Dialpad WebSocket relay — after resolving tenant via
 *      `dialpad_account_id` (see lib/tenant/context.ts → resolveTenantByDialpadAccount).
 *   2. The suggestion worker — after verifying tenant from the active call.
 *
 * Every query made with this client MUST include an explicit
 * `eq('tenant_id', verifiedTenantId)` filter. Cross-tenant joins on
 * `kb_chunks` or any other domain table will leak data.
 *
 * NEVER import this from a Client Component or any code reachable from one.
 */
export function createServiceClient(): DbClient {
  return _createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
