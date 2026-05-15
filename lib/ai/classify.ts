import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

import { logger } from '@/lib/logger';

import { MODELS } from './models';
import { recordUsage } from './usage';

export const KNOWN_INTENT_TAGS = [
  'objection',
  'pricing',
  'discovery_question',
  'competitor',
  'case_study',
  'qualifying_criteria',
  'product_fact',
  'brand_voice',
] as const;
export type IntentTag = (typeof KNOWN_INTENT_TAGS)[number];

export type ClassifyResult = {
  title: string;
  intent_tags: IntentTag[];
};

const ClassifySchema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe('A 5–10 word summary of what this chunk is about.'),
  intent_tags: z
    .array(z.enum(KNOWN_INTENT_TAGS))
    .min(1)
    .max(3)
    .describe('1–3 intent tags drawn ONLY from the allowed list.'),
});

const SYSTEM_PROMPT = `You classify chunks of a sales knowledge base. Each chunk is one passage drawn from a tenant's playbook, FAQ, objection handling notes, case studies, or product docs.

Pick 1–3 intent tags that best describe what the chunk is FOR (i.e. when the agent would want to surface it during a live call), not what it IS.

Allowed intent tags:
- objection: rebuttal language for any common objection (price, timing, authority, need, competitor)
- pricing: pricing tiers, defending price, ROI talk
- discovery_question: open-ended questions to ask the prospect to qualify or uncover need
- competitor: how we compare to specific named competitors
- case_study: short success stories with named outcomes
- qualifying_criteria: ICP, deal-breakers, must-haves, disqualifiers
- product_fact: specifications, integrations, capabilities, limits
- brand_voice: tone rules, words to avoid, sample phrasings

Also produce a short title (~7 words) the agent would scan in a list.

Return JSON only. Do not invent tags outside the allowed list.`;

export async function classifyChunk(tenantId: string, content: string): Promise<ClassifyResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('classifyChunk: content is empty');
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { object, usage } = await generateObject({
        model: openai(MODELS.GATE),
        schema: ClassifySchema,
        system: SYSTEM_PROMPT,
        prompt: `Chunk:\n"""\n${trimmed}\n"""`,
        maxOutputTokens: 400,
        temperature: 0,
      });

      // Record usage after success. Don't await failures into the user path —
      // log and continue so a usage write doesn't lose the classification.
      recordUsage(tenantId, {
        model: MODELS.GATE,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cachedInputTokens: usage.cachedInputTokens ?? 0,
      }).catch((err) =>
        logger.error(
          { err: err instanceof Error ? err.message : String(err), tenantId, model: MODELS.GATE },
          'recordUsage failed (classify)',
        ),
      );

      return { title: object.title, intent_tags: object.intent_tags };
    } catch (err) {
      if (attempt === 1) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'classifyChunk attempt 1 failed; retrying',
        );
        continue;
      }
      throw err;
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new Error('classifyChunk: exhausted retries');
}
