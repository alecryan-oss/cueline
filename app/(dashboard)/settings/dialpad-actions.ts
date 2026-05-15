'use server';

import { revalidatePath } from 'next/cache';

import { createServiceClient } from '@/lib/db/client';
import { getTenantIntegration, clearDialpadConnection } from '@/lib/db/queries/tenantIntegrations';
import { revokeToken } from '@/lib/dialpad/client';
import { decryptToken } from '@/lib/dialpad/crypto';
import { logger } from '@/lib/logger';
import { requireTenant } from '@/lib/tenant/context';

export type DisconnectResult = { ok: boolean; error?: string };

export async function disconnectDialpad(): Promise<DisconnectResult> {
  const { tenantId, role } = await requireTenant();
  if (role !== 'owner') {
    return { ok: false, error: 'Only the workspace owner can disconnect Dialpad.' };
  }

  const service = createServiceClient();
  const integration = await getTenantIntegration(service, tenantId);

  // Best-effort remote revoke before clearing local state.
  if (integration?.dialpad_access_token_encrypted) {
    try {
      const accessToken = decryptToken(integration.dialpad_access_token_encrypted);
      await revokeToken(accessToken);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), tenantId },
        'dialpad disconnect: remote revoke failed (proceeding with local clear)',
      );
    }
  }

  try {
    await clearDialpadConnection(service, tenantId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath('/settings');
  return { ok: true };
}
