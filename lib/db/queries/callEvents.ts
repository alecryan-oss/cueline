import type { DbClient } from '@/lib/db/client';
import type { InsertRow, Row } from '@/lib/db/types';

export async function insertCallEvent(
  client: DbClient,
  tenantId: string,
  event: Omit<InsertRow<'call_events'>, 'tenant_id'>,
): Promise<Row<'call_events'>> {
  const { data, error } = await client
    .from('call_events')
    .insert({ ...event, tenant_id: tenantId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listCallEvents(
  client: DbClient,
  tenantId: string,
  callId: string,
): Promise<Row<'call_events'>[]> {
  const { data, error } = await client
    .from('call_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('call_id', callId)
    .order('occurred_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Initial backfill for the live call view: most recent N events ordered
 * oldest-first (so the transcript reads top-to-bottom). Realtime subscription
 * picks up everything after.
 */
export async function listRecentCallEvents(
  client: DbClient,
  tenantId: string,
  callId: string,
  limit = 50,
): Promise<Row<'call_events'>[]> {
  const { data, error } = await client
    .from('call_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('call_id', callId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).reverse();
}

export async function listRecentProspectTurns(
  client: DbClient,
  tenantId: string,
  callId: string,
  limit = 10,
): Promise<Row<'call_events'>[]> {
  const { data, error } = await client
    .from('call_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('call_id', callId)
    .eq('speaker', 'contact')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).reverse();
}
