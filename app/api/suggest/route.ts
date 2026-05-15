import { after, NextResponse } from 'next/server';
import { z } from 'zod';

import { classifyTurn } from '@/lib/ai/gate';
import { generateSuggestion } from '@/lib/ai/suggest';
import { createServiceClient } from '@/lib/db/client';
import { listRecentCallEvents } from '@/lib/db/queries/callEvents';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { checkCostCeiling } from '@/lib/tenant/billing';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  callId: z.string().uuid(),
  eventId: z.number().int().positive(),
});

export async function POST(req: Request): Promise<Response> {
  // Header auth — never serve a request without the shared secret.
  const provided = req.headers.get('x-internal-secret');
  if (!provided || provided !== env.SUGGEST_INTERNAL_SECRET) {
    logger.warn({ provided: provided ? 'present' : 'missing' }, '/api/suggest unauthorized');
    return new NextResponse(null, { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid body' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Look up the triggering event. Must be a contact turn with a known tenant.
  const { data: event, error: eventErr } = await supabase
    .from('call_events')
    .select('id, tenant_id, call_id, speaker, text')
    .eq('id', body.eventId)
    .maybeSingle();

  if (eventErr || !event) {
    logger.warn({ eventId: body.eventId, err: eventErr?.message }, '/api/suggest unknown event');
    return new NextResponse(null, { status: 404 });
  }
  if (event.call_id !== body.callId) {
    return NextResponse.json({ error: 'callId/eventId mismatch' }, { status: 400 });
  }
  if (event.speaker !== 'contact') {
    return NextResponse.json({ error: 'speaker_not_contact' }, { status: 400 });
  }

  const tenantId = event.tenant_id;
  const callId = event.call_id;

  const ceiling = await checkCostCeiling(tenantId);
  if (!ceiling.allowed) {
    logger.info(
      { tenantId, current: ceiling.current, ceiling: ceiling.ceiling },
      '/api/suggest blocked: cost ceiling',
    );
    return NextResponse.json(
      { error: 'cost_ceiling_reached', ...ceiling },
      { status: 402 },
    );
  }

  // Pull recent context + call setup metadata in parallel.
  const [recentEvents, callMeta] = await Promise.all([
    listRecentCallEvents(supabase, tenantId, callId, 10),
    supabase
      .from('calls')
      .select('call_type, goal')
      .eq('id', callId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  const callContext = {
    callType: callMeta?.call_type ?? null,
    goal: callMeta?.goal ?? null,
  };

  // Stage 1 gating runs FIRST. Only insert a suggestions row when the gate
  // says yes — otherwise the live view would flash short-lived "Thinking…"
  // placeholders for every filler turn before they get DELETEd.
  const stage1 = await classifyTurn({ tenantId, callId, recentEvents, callContext });

  if (!stage1.suggest) {
    logger.debug(
      { tenantId, callId, reasoning: stage1.reasoning, eventText: event.text?.slice(0, 80) },
      'gate filtered',
    );
    return new NextResponse(null, { status: 204 });
  }

  // Gate cleared. If there's already an in-flight suggestion for this call
  // (still streaming), REUSE its row and reset content — the prior Stage 2
  // gets aborted inside generateSuggestion. The Replace pattern: newer
  // context wins, no duplicate cards stack up during a long prospect turn.
  // 15s window: tight enough that an orphaned row from a crashed Stage 2
  // doesn't keep blocking new cards forever.
  const inFlightWindow = new Date(Date.now() - 15_000).toISOString();
  const { data: active } = await supabase
    .from('suggestions')
    .select('id, intent, is_complete, created_at')
    .eq('tenant_id', tenantId)
    .eq('call_id', callId)
    .eq('is_complete', false)
    .gte('created_at', inFlightWindow)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let suggestionId: string;
  if (active) {
    suggestionId = active.id;
    const { error: resetErr } = await supabase
      .from('suggestions')
      .update({
        content: '',
        intent: stage1.intent,
        triggered_by_event_id: event.id,
      })
      .eq('id', suggestionId);
    if (resetErr) {
      logger.error(
        { err: resetErr.message, tenantId, callId, suggestionId },
        '/api/suggest: reset of in-flight suggestion failed',
      );
      return new NextResponse(null, { status: 500 });
    }
    logger.debug(
      { tenantId, callId, suggestionId, intent: stage1.intent },
      'reusing in-flight suggestion (Replace)',
    );
  } else {
    const { data: placeholder, error: insErr } = await supabase
      .from('suggestions')
      .insert({
        tenant_id: tenantId,
        call_id: callId,
        triggered_by_event_id: event.id,
        intent: stage1.intent,
        content: '',
        is_complete: false,
      })
      .select('id')
      .single();
    if (insErr || !placeholder) {
      logger.error(
        { err: insErr?.message, tenantId, callId, intent: stage1.intent },
        '/api/suggest placeholder insert failed',
      );
      return new NextResponse(null, { status: 500 });
    }
    suggestionId = placeholder.id;
  }

  // Kick off Stage 2 *after* the response. Vercel/Next 16: `after` runs the
  // callback once the response has been streamed back to the client.
  after(async () => {
    try {
      await generateSuggestion({
        tenantId,
        callId,
        suggestionId,
        intent: stage1.intent,
        entities: stage1.entities,
        recentEvents,
        callContext,
      });
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), suggestionId },
        'generateSuggestion threw outside the inner try/catch',
      );
    }
  });

  return NextResponse.json({ suggestionId, intent: stage1.intent }, { status: 200 });
}
