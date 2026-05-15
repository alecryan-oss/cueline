import type { DbClient } from '@/lib/db/client';
import type { InsertRow, Row, UpdateRow } from '@/lib/db/types';

export type CallWithStats = Row<'calls'> & {
  suggestion_count: number;
  used_count: number;
};

export async function listRecentCalls(
  client: DbClient,
  tenantId: string,
  limit = 25,
): Promise<Row<'calls'>[]> {
  const { data, error } = await client
    .from('calls')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getCallById(
  client: DbClient,
  tenantId: string,
  callId: string,
): Promise<Row<'calls'> | null> {
  const { data, error } = await client
    .from('calls')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', callId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getCallByDialpadId(
  client: DbClient,
  tenantId: string,
  dialpadCallId: string,
): Promise<Row<'calls'> | null> {
  const { data, error } = await client
    .from('calls')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('dialpad_call_id', dialpadCallId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertCall(
  client: DbClient,
  tenantId: string,
  call: Omit<InsertRow<'calls'>, 'tenant_id'>,
): Promise<Row<'calls'>> {
  const { data, error } = await client
    .from('calls')
    .insert({ ...call, tenant_id: tenantId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * List recent calls with suggestion counts. Stats are computed in JS by
 * grouping a single bulk query — fine for small lists (≤200 calls). Switch
 * to a Postgres view + RPC when scale demands.
 */
export async function listCallsWithStats(
  client: DbClient,
  tenantId: string,
  limit = 50,
): Promise<CallWithStats[]> {
  const { data: calls, error } = await client
    .from('calls')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!calls || calls.length === 0) return [];

  const callIds = calls.map((c) => c.id);
  const { data: suggestions, error: sugErr } = await client
    .from('suggestions')
    .select('call_id, was_used')
    .eq('tenant_id', tenantId)
    .in('call_id', callIds);
  if (sugErr) throw sugErr;

  const stats = new Map<string, { total: number; used: number }>();
  for (const s of suggestions ?? []) {
    const cur = stats.get(s.call_id) ?? { total: 0, used: 0 };
    cur.total++;
    if (s.was_used) cur.used++;
    stats.set(s.call_id, cur);
  }

  return calls.map((c) => ({
    ...c,
    suggestion_count: stats.get(c.id)?.total ?? 0,
    used_count: stats.get(c.id)?.used ?? 0,
  }));
}

export async function updateCall(
  client: DbClient,
  tenantId: string,
  callId: string,
  patch: Omit<UpdateRow<'calls'>, 'tenant_id' | 'id'>,
): Promise<Row<'calls'>> {
  const { data, error } = await client
    .from('calls')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', callId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
