import type { DbClient } from '@/lib/db/client';
import type { InsertRow, Row } from '@/lib/db/types';

export type KbMatch = { id: string; content: string; similarity: number };

/**
 * Vector search over the tenant's KB chunks, filtered by intent_tags array
 * overlap. Tenant filter is applied inside the SQL function before the
 * similarity sort — see supabase/migrations/0001_initial_schema.sql.
 */
export async function searchKbChunks(
  client: DbClient,
  tenantId: string,
  queryEmbedding: number[],
  intentTags: string[],
  limit = 5,
): Promise<KbMatch[]> {
  const { data, error } = await client.rpc('match_kb_chunks', {
    // pgvector accepts a JSON-style array string over PostgREST
    query_embedding: `[${queryEmbedding.join(',')}]`,
    filter_tenant_id: tenantId,
    filter_intents: intentTags,
    match_count: limit,
  });

  if (error) throw error;
  return data ?? [];
}

export async function insertKbChunk(
  client: DbClient,
  tenantId: string,
  chunk: Omit<InsertRow<'kb_chunks'>, 'tenant_id'>,
): Promise<Row<'kb_chunks'>> {
  const { data, error } = await client
    .from('kb_chunks')
    .insert({ ...chunk, tenant_id: tenantId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function insertKbChunks(
  client: DbClient,
  tenantId: string,
  chunks: Array<Omit<InsertRow<'kb_chunks'>, 'tenant_id'>>,
): Promise<Row<'kb_chunks'>[]> {
  if (chunks.length === 0) return [];
  const { data, error } = await client
    .from('kb_chunks')
    .insert(chunks.map((c) => ({ ...c, tenant_id: tenantId })))
    .select();

  if (error) throw error;
  return data ?? [];
}

export async function listKbChunks(
  client: DbClient,
  tenantId: string,
): Promise<Row<'kb_chunks'>[]> {
  const { data, error } = await client
    .from('kb_chunks')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function deleteKbChunk(
  client: DbClient,
  tenantId: string,
  chunkId: string,
): Promise<void> {
  const { error } = await client
    .from('kb_chunks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', chunkId);

  if (error) throw error;
}

export async function listBrandVoiceChunks(
  client: DbClient,
  tenantId: string,
): Promise<Row<'kb_chunks'>[]> {
  const { data, error } = await client
    .from('kb_chunks')
    .select('*')
    .eq('tenant_id', tenantId)
    .contains('intent_tags', ['brand_voice']);

  if (error) throw error;
  return data ?? [];
}
