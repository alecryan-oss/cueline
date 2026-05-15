'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { generateProspectReplyStream } from '@/lib/ai/prospect';
import { createServerClient, createServiceClient } from '@/lib/db/client';
import { listRecentCallEvents } from '@/lib/db/queries/callEvents';
import { getCallById } from '@/lib/db/queries/calls';
import { insertCallEvent } from '@/lib/db/queries/callEvents';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireTenant } from '@/lib/tenant/context';

export type ProspectActionResult =
  | { ok: true; fullText: string }
  | { ok: false; error: string };

const Schema = z.object({
  callId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
});

function ensureMockEnabled() {
  if (env.NODE_ENV !== 'development' || env.ENABLE_MOCK_CALLS !== 'true') {
    throw new Error('AI prospect mode is dev-only.');
  }
}

const CHUNK_DELAY_MS = 350;

/**
 * Sends the user's message as an `operator` event, then streams an AI
 * prospect reply, injecting it as a sequence of `contact` events with a
 * small delay between chunks. Each contact event triggers /api/suggest;
 * the suggestion pipeline's Replace pattern will keep refining the card
 * as more chunks land.
 */
export async function sendProspectMessage(
  callId: string,
  text: string,
): Promise<ProspectActionResult> {
  ensureMockEnabled();

  const parsed = Schema.safeParse({ callId, text });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const { tenantId } = await requireTenant();

  const cookieStore = await cookies();
  const sessionClient = createServerClient(cookieStore);
  const service = createServiceClient();

  const call = await getCallById(sessionClient, tenantId, parsed.data.callId);
  if (!call) return { ok: false, error: 'Call not found in this tenant.' };

  // 1. Inject the user's message as an operator event.
  try {
    await insertCallEvent(service, tenantId, {
      call_id: call.id,
      speaker: 'operator',
      text: parsed.data.text,
      occurred_at: new Date().toISOString(),
      event_state: 'call_transcription',
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Pull the latest history (now including the operator message above)
  //    and stream the prospect reply, injecting each chunk as a contact event.
  const recent = await listRecentCallEvents(service, tenantId, call.id, 20);

  let fullText = '';
  try {
    await generateProspectReplyStream({
      tenantId,
      callId: call.id,
      recentEvents: recent,
      onChunk: async (chunk) => {
        fullText += (fullText ? ' ' : '') + chunk;
        try {
          const event = await insertCallEvent(service, tenantId, {
            call_id: call.id,
            speaker: 'contact',
            text: chunk,
            occurred_at: new Date().toISOString(),
            event_state: 'call_transcription',
          });

          // Fire-and-forget /api/suggest just like the simulator does.
          const url = `${env.NEXT_PUBLIC_APP_URL}/api/suggest`;
          fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-internal-secret': env.SUGGEST_INTERNAL_SECRET,
            },
            body: JSON.stringify({ callId: call.id, eventId: event.id }),
          }).catch((err) =>
            logger.debug(
              { err: err instanceof Error ? err.message : String(err), callId: call.id },
              'fire-and-forget /api/suggest failed (prospect chunk)',
            ),
          );
        } catch (err) {
          logger.error(
            { err: err instanceof Error ? err.message : String(err), callId: call.id },
            'sendProspectMessage: chunk insert failed',
          );
        }
        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      },
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), callId: call.id },
      'sendProspectMessage: stream failed',
    );
    return { ok: false, error: 'Prospect reply failed.' };
  }

  return { ok: true, fullText };
}
