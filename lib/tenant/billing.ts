import { createServiceClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export type CostCeilingStatus = {
  allowed: boolean;
  current: number;
  ceiling: number;
};

/**
 * Returns the tenant's current month-to-date spend, their ceiling, and whether
 * they're still under it. Call at the start of any Server Action or worker
 * that's about to spend money (KB ingest, suggestion generation, etc.).
 *
 * Per docs/llm-pipeline.md: when over the ceiling, Stage 2 is disabled but
 * Stage 1 keeps running for analytics. Callers decide enforcement.
 *
 * Service-role read (bypasses RLS) — caller must have verified tenantId.
 * Fails closed: any DB error returns `allowed: false` so we don't silently
 * overspend.
 */
export async function checkCostCeiling(tenantId: string): Promise<CostCeilingStatus> {
  const supabase = createServiceClient();

  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('monthly_cost_ceiling_usd')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr || !tenant) {
    logger.error({ err: tenantErr?.message, tenantId }, 'checkCostCeiling: tenant lookup failed');
    return { allowed: false, current: 0, ceiling: 0 };
  }

  const monthStart = currentMonthStart();
  const { data: rows, error: usageErr } = await supabase
    .from('tenant_usage')
    .select('total_usd')
    .eq('tenant_id', tenantId)
    .gte('day', monthStart);
  if (usageErr) {
    logger.error({ err: usageErr.message, tenantId }, 'checkCostCeiling: usage lookup failed');
    return { allowed: false, current: 0, ceiling: Number(tenant.monthly_cost_ceiling_usd) };
  }

  const current = (rows ?? []).reduce((sum, r) => sum + Number(r.total_usd ?? 0), 0);
  const ceiling = Number(tenant.monthly_cost_ceiling_usd);
  return { allowed: current < ceiling, current, ceiling };
}

function currentMonthStart(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}
