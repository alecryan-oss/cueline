'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerClient } from '@/lib/db/client';
import { deleteKbChunk } from '@/lib/db/queries/kbChunks';
import { logger } from '@/lib/logger';
import { requireTenant } from '@/lib/tenant/context';

export type KbActionState = { ok: boolean; error?: string; message?: string };

const DeleteSchema = z.object({ id: z.string().uuid() });

export async function deleteChunk(
  _prev: KbActionState | undefined,
  formData: FormData,
): Promise<KbActionState> {
  const { tenantId, role } = await requireTenant();
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can edit the knowledge base.' };
  }

  const parsed = DeleteSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid chunk id' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  try {
    await deleteKbChunk(supabase, tenantId, parsed.data.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, tenantId, chunkId: parsed.data.id }, 'kb delete failed');
    return { ok: false, error: msg };
  }
  revalidatePath('/kb');
  return { ok: true, message: 'Chunk deleted.' };
}
