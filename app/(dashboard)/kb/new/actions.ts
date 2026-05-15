'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { chunkText } from '@/lib/ai/chunk';
import { classifyChunk, KNOWN_INTENT_TAGS } from '@/lib/ai/classify';
import { embedTexts, EMBEDDING_DIMS, toPgVector } from '@/lib/ai/embeddings';
import { createServerClient } from '@/lib/db/client';
import { insertKbChunks } from '@/lib/db/queries/kbChunks';
import { logger } from '@/lib/logger';
import { checkCostCeiling } from '@/lib/tenant/billing';
import { requireTenant } from '@/lib/tenant/context';

const MAX_INPUT_CHARS = 50_000;
const MAX_DRAFT_CHUNKS = 20;

export type DraftChunk = {
  id: string;
  title: string;
  content: string;
  intent_tags: string[];
  embedding: number[];
};

export type ClassifyState =
  | undefined
  | { ok: true; drafts: DraftChunk[]; message?: string }
  | { ok: false; error: string };

export type SaveResult = { ok: true; count: number } | { ok: false; error: string };

const PasteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(20, 'Paste at least a sentence or two of content.')
    .max(MAX_INPUT_CHARS, `Content is too long (max ${MAX_INPUT_CHARS} characters).`),
});

const DraftSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  intent_tags: z.array(z.string().min(1)).min(1).max(5),
  embedding: z.array(z.number()).length(EMBEDDING_DIMS),
});

export async function classifyAndChunk(
  _prev: ClassifyState,
  formData: FormData,
): Promise<ClassifyState> {
  const { tenantId, role } = await requireTenant();
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can edit the knowledge base.' };
  }

  const ceiling = await checkCostCeiling(tenantId);
  if (!ceiling.allowed) {
    return {
      ok: false,
      error: `Monthly cost ceiling reached ($${ceiling.current.toFixed(2)} of $${ceiling.ceiling.toFixed(2)}). Raise the limit in Settings to add more content.`,
    };
  }

  const parsed = PasteSchema.safeParse({ content: formData.get('content') });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid content' };
  }

  const chunks = chunkText(parsed.data.content);
  if (chunks.length === 0) {
    return { ok: false, error: 'Could not split the content into chunks.' };
  }
  if (chunks.length > MAX_DRAFT_CHUNKS) {
    return {
      ok: false,
      error: `Pasted content produced ${chunks.length} chunks (max ${MAX_DRAFT_CHUNKS}). Split it into smaller pastes.`,
    };
  }

  try {
    const [classifications, embeddings] = await Promise.all([
      Promise.all(chunks.map((c) => classifyChunk(tenantId, c))),
      embedTexts(tenantId, chunks),
    ]);

    const drafts: DraftChunk[] = chunks.map((content, i) => ({
      id: cryptoRandomId(),
      title: classifications[i]!.title,
      content,
      intent_tags: classifications[i]!.intent_tags,
      embedding: embeddings[i]!,
    }));

    return { ok: true, drafts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, tenantId, chunkCount: chunks.length }, 'classify/embed failed');
    return { ok: false, error: `Failed to process content: ${msg}` };
  }
}

export async function saveDrafts(drafts: DraftChunk[]): Promise<SaveResult> {
  const { tenantId, role } = await requireTenant();
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can save knowledge base content.' };
  }

  const parsed = z.array(DraftSchema).min(1).max(MAX_DRAFT_CHUNKS).safeParse(drafts);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Drafts failed validation',
    };
  }

  // Warn (don't block) when a draft has tags outside the known taxonomy. They
  // will still insert — pgvector retrieval just won't match them via Stage 1.
  for (const draft of parsed.data) {
    for (const tag of draft.intent_tags) {
      if (!(KNOWN_INTENT_TAGS as readonly string[]).includes(tag)) {
        logger.warn({ tenantId, tag, draftId: draft.id }, 'unknown intent tag in draft');
      }
    }
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  try {
    const inserted = await insertKbChunks(
      supabase,
      tenantId,
      parsed.data.map((d) => ({
        title: d.title,
        content: d.content,
        intent_tags: d.intent_tags,
        embedding: toPgVector(d.embedding),
      })),
    );
    revalidatePath('/kb');
    return { ok: true, count: inserted.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, tenantId, draftCount: parsed.data.length }, 'kb save failed');
    return { ok: false, error: msg };
  }
}

function cryptoRandomId(): string {
  // Server-side: crypto is available globally in Node 19+/Next runtime.
  return crypto.randomUUID();
}
