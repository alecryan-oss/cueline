import { cookies } from 'next/headers';

import { createServerClient, createServiceClient } from '@/lib/db/client';
import type { TenantRole } from '@/lib/db/types';

export type TenantMembership = {
  userId: string;
  tenantId: string;
  role: TenantRole;
};

export class UnauthenticatedError extends Error {
  constructor() {
    super('not authenticated');
    this.name = 'UnauthenticatedError';
  }
}

export class NoTenantError extends Error {
  constructor(userId: string) {
    super(`user ${userId} has no tenant membership`);
    this.name = 'NoTenantError';
  }
}

export class MultipleTenantsError extends Error {
  constructor(userId: string) {
    super(`user ${userId} belongs to multiple tenants — multi-tenant users are a v2 feature`);
    this.name = 'MultipleTenantsError';
  }
}

/**
 * Look up the tenant a user belongs to. Returns null if the user has no
 * membership. Throws MultipleTenantsError if they belong to more than one
 * (v1 assumes one tenant per user).
 */
export async function getActiveTenant(userId: string): Promise<TenantMembership | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', userId);

  if (error) throw error;
  if (!data || data.length === 0) return null;
  if (data.length > 1) throw new MultipleTenantsError(userId);

  const row = data[0]!;
  return { userId, tenantId: row.tenant_id, role: row.role as TenantRole };
}

/**
 * Convenience for Server Actions / Route Handlers / RSCs serving the browser.
 * Resolves the current authenticated user and their tenant in one call.
 *
 * Throws:
 *   - UnauthenticatedError if no user is signed in
 *   - NoTenantError if the user has no tenant_members row
 *   - MultipleTenantsError if the user belongs to >1 tenant (v2)
 */
export async function requireTenant(): Promise<TenantMembership> {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new UnauthenticatedError();

  const userId = user.id;
  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', userId);

  if (error) throw error;
  if (!data || data.length === 0) throw new NoTenantError(userId);
  if (data.length > 1) throw new MultipleTenantsError(userId);

  const row = data[0]!;
  return { userId, tenantId: row.tenant_id, role: row.role as TenantRole };
}

/**
 * Resolve a tenant from a Dialpad company_id. Used by the WS relay to map
 * incoming events to a tenant. Returns null if no tenant has authorized
 * that account — the relay should drop the event in that case (never
 * default to a tenant).
 *
 * Uses the service-role client because the WS relay has no user session.
 */
export async function resolveTenantByDialpadAccount(
  dialpadAccountId: string,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('dialpad_account_id', dialpadAccountId)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}
