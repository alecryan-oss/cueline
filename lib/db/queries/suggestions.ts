import type { DbClient } from '@/lib/db/client';
import type { InsertRow, Row } from '@/lib/db/types';

export async function listSuggestionsForCall(
  client: DbClient,
  tenantId: string,
  callId: string,
): Promise<Row<'suggestions'>[]> {
  const { data, error } = await client
    .from('suggestions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('call_id', callId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function insertSuggestion(
  client: DbClient,
  tenantId: string,
  suggestion: Omit<InsertRow<'suggestions'>, 'tenant_id'>,
): Promise<Row<'suggestions'>> {
  const { data, error } = await client
    .from('suggestions')
    .insert({ ...suggestion, tenant_id: tenantId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Append a streamed delta to a suggestion's content. Reads the current value
 * then writes the concatenation. Acceptable for single-writer streaming
 * (one Sonnet call per suggestion); upgrade to a Postgres function with
 * `content = content || $delta` if multiple writers ever contend.
 */
export async function appendSuggestionDelta(
  client: DbClient,
  tenantId: string,
  suggestionId: string,
  delta: string,
): Promise<void> {
  const { data: current, error: readErr } = await client
    .from('suggestions')
    .select('content')
    .eq('tenant_id', tenantId)
    .eq('id', suggestionId)
    .single();
  if (readErr) throw readErr;

  const { error } = await client
    .from('suggestions')
    .update({ content: current.content + delta })
    .eq('tenant_id', tenantId)
    .eq('id', suggestionId);
  if (error) throw error;
}

export async function markSuggestionComplete(
  client: DbClient,
  tenantId: string,
  suggestionId: string,
): Promise<void> {
  const { error } = await client
    .from('suggestions')
    .update({ is_complete: true })
    .eq('tenant_id', tenantId)
    .eq('id', suggestionId);

  if (error) throw error;
}

export async function recordSuggestionFeedback(
  client: DbClient,
  tenantId: string,
  suggestionId: string,
  wasUsed: boolean,
): Promise<void> {
  const { error } = await client
    .from('suggestions')
    .update({ was_used: wasUsed })
    .eq('tenant_id', tenantId)
    .eq('id', suggestionId);

  if (error) throw error;
}
