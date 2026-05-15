import type { DbClient } from '@/lib/db/client';
import type { Row } from '@/lib/db/types';

export type TenantIntegration = Row<'tenant_integrations'>;

export async function getTenantIntegration(
  client: DbClient,
  tenantId: string,
): Promise<TenantIntegration | null> {
  const { data, error } = await client
    .from('tenant_integrations')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Upserts the tenant's Dialpad connection state. Always called via the
 * service-role client because tenant_integrations is owner-only-readable
 * for the user-facing roles, and the OAuth callback runs server-side.
 */
export async function upsertDialpadConnection(
  client: DbClient,
  tenantId: string,
  patch: {
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: string;
    dialpadUserId: string;
    dialpadUserEmail: string | null;
    dialpadCompanyId: string | null;
  },
): Promise<void> {
  const { error } = await client.from('tenant_integrations').upsert(
    {
      tenant_id: tenantId,
      dialpad_access_token_encrypted: patch.accessTokenEncrypted,
      dialpad_refresh_token_encrypted: patch.refreshTokenEncrypted,
      dialpad_token_expires_at: patch.tokenExpiresAt,
      dialpad_user_id: patch.dialpadUserId,
      dialpad_user_email: patch.dialpadUserEmail,
      dialpad_company_id: patch.dialpadCompanyId,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );
  if (error) throw error;
}

/** Clears Dialpad-specific fields. Keeps the row so we don't lose audit history. */
export async function clearDialpadConnection(
  client: DbClient,
  tenantId: string,
): Promise<void> {
  const { error } = await client
    .from('tenant_integrations')
    .update({
      dialpad_access_token_encrypted: null,
      dialpad_refresh_token_encrypted: null,
      dialpad_token_expires_at: null,
      dialpad_user_id: null,
      dialpad_user_email: null,
      dialpad_company_id: null,
      dialpad_subscription_id: null,
      dialpad_websocket_id: null,
      connected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);
  if (error) throw error;
}
