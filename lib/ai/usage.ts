import { createServiceClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

import { computeCost } from './pricing';
import type { ModelId } from './models';

export type UsageRecord = {
  model: ModelId;
  inputTokens: number;
  outputTokens?: number;
  cachedInputTokens?: number;
};

/**
 * Records a single OpenAI call's usage against the tenant. Computes cost
 * locally, then atomically upserts into `tenant_usage` via the
 * `add_tenant_usage` Postgres function (see migration 0003).
 *
 * Returns the tenant's month-to-date USD total after the increment.
 *
 * Uses the service-role client because tenant_usage is server-write only
 * (no INSERT policy for the user-facing roles). Caller must have already
 * verified `tenantId` via requireTenant or resolveTenantByDialpadAccount.
 */
export async function recordUsage(tenantId: string, usage: UsageRecord): Promise<number> {
  const cost = computeCost(usage);
  const day = todayUtc();

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('add_tenant_usage', {
    p_tenant_id: tenantId,
    p_day: day,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens ?? 0,
    p_cost: cost,
  });

  if (error) {
    logger.error(
      { err: error.message, tenantId, model: usage.model, cost },
      'recordUsage rpc failed',
    );
    throw error;
  }

  // The function returns numeric — supabase-js may surface it as number or string.
  return Number(data ?? 0);
}

function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
