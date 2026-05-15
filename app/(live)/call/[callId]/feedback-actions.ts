'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { createServerClient } from '@/lib/db/client';
import { recordSuggestionFeedback } from '@/lib/db/queries/suggestions';
import { logger } from '@/lib/logger';
import { requireTenant } from '@/lib/tenant/context';

const Schema = z.object({
  suggestionId: z.string().uuid(),
  wasUsed: z.boolean(),
});

export type FeedbackResult = { ok: true } | { ok: false; error: string };

export async function markSuggestionFeedback(
  suggestionId: string,
  wasUsed: boolean,
): Promise<FeedbackResult> {
  const parsed = Schema.safeParse({ suggestionId, wasUsed });
  if (!parsed.success) return { ok: false, error: 'invalid input' };

  const { tenantId } = await requireTenant();
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  try {
    await recordSuggestionFeedback(
      supabase,
      tenantId,
      parsed.data.suggestionId,
      parsed.data.wasUsed,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: msg, tenantId, suggestionId: parsed.data.suggestionId },
      'recordSuggestionFeedback failed',
    );
    return { ok: false, error: msg };
  }
  return { ok: true };
}
