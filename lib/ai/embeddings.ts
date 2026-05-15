import OpenAI from 'openai';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

import { MODELS } from './models';
import { recordUsage } from './usage';

// We use the raw `openai` client (not @ai-sdk/openai) for embeddings because:
//   - Embeddings are one-shot, non-streaming, naturally batched.
//   - The raw response gives us `usage.prompt_tokens` cleanly for cost
//     attribution. The AI SDK's embed() exposes equivalent data but the
//     raw client's shape lines up 1:1 with our recordUsage call.
// See lib/ai/README.md for the project-wide provider convention.

export const EMBEDDING_MODEL = MODELS.EMBEDDING;
export const EMBEDDING_DIMS = 1536;

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return cachedClient;
}

export async function embedTexts(tenantId: string, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const res = await client().embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    recordUsage(tenantId, {
      model: EMBEDDING_MODEL,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      // Embeddings have no output-token billing.
    }).catch((err) =>
      logger.error(
        { err: err instanceof Error ? err.message : String(err), tenantId, model: EMBEDDING_MODEL },
        'recordUsage failed (embed)',
      ),
    );

    // OpenAI returns embeddings in input order.
    return res.data.map((d) => d.embedding);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`embedTexts failed (${EMBEDDING_MODEL}): ${msg}`);
  }
}

export async function embedText(tenantId: string, text: string): Promise<number[]> {
  const [embedding] = await embedTexts(tenantId, [text]);
  if (!embedding) {
    throw new Error('embedText: no embedding returned');
  }
  return embedding;
}

/** pgvector accepts the JSON-array string representation over PostgREST. */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
