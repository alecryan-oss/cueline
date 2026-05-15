import OpenAI from 'openai';
import { z } from 'zod';

import type { Row } from '@/lib/db/types';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

import { MODELS } from './models';
import { recordUsage } from './usage';

export const INTENT_LABELS = [
  'objection_pricing',
  'objection_timing',
  'objection_authority',
  'objection_need',
  'objection_competitor',
  'discovery_question',
  'buying_signal',
  'request_for_info',
] as const;
export type IntentLabel = (typeof INTENT_LABELS)[number];

export type Stage1Result =
  | { suggest: false; reasoning?: string }
  | { suggest: true; intent: IntentLabel; entities?: string[]; reasoning?: string };

export type CallContext = {
  callType: string | null;
  goal: string | null;
};

// docs/llm-pipeline.md targets 800ms for the gate, but with strict JSON schema
// mode + a sizable intent taxonomy prompt, gpt-4o-mini consistently runs
// 1.0–1.5s. 2500ms keeps headroom without blowing the live-call latency budget.
const GATE_TIMEOUT_MS = 2500;

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

const SYSTEM_PROMPT = `You classify a single live sales-call turn from the prospect (the "contact") and decide whether the agent's screen should show an AI suggestion card.

Default to suggest: false. Only set suggest: true when ONE of these is clearly happening:
- objection_pricing — prospect pushes back on price/cost
- objection_timing — prospect says "not now", "next quarter", "too soon", etc.
- objection_authority — "I need to check with…", "we need approval from…"
- objection_need — "we don't really have that problem", "we already do this in-house"
- objection_competitor — prospect names a specific competitor or compares
- discovery_question — prospect asks a substantive question (about product, integrations, capabilities, pricing tiers, scoping)
- buying_signal — prospect indicates timeline, budget, decision process, intent to move forward
- request_for_info — prospect asks for materials, references, demo, follow-up

NEVER suggest: true for filler ("yeah", "mm-hm", "right", "okay", "sure", "got it"), acknowledgments, small talk, polite chatter, restatements, or back-channel utterances. These are 80% of turns and must be filtered.

When in doubt, suggest: false. Cost of a missed suggestion: small. Cost of a noisy suggestion: agent stops trusting the panel.

Output STRICT JSON matching the schema. If suggest is false, set intent to null and entities to []. The reasoning field is one short sentence for our debugging.`;

// Strict-mode JSON schema. OpenAI requires every property listed in `required`,
// nullable types via `["string", "null"]`, and additionalProperties: false.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    suggest: { type: 'boolean' },
    intent: {
      type: ['string', 'null'],
      enum: [...INTENT_LABELS, null],
    },
    entities: {
      type: 'array',
      items: { type: 'string' },
    },
    reasoning: { type: 'string' },
  },
  required: ['suggest', 'intent', 'entities', 'reasoning'],
  additionalProperties: false,
} as const;

const RawSchema = z.object({
  suggest: z.boolean(),
  intent: z.union([z.enum(INTENT_LABELS), z.null()]),
  entities: z.array(z.string()),
  reasoning: z.string(),
});

function formatRecentEvents(events: Row<'call_events'>[]): string {
  return events
    .map((e) => {
      const who = e.speaker === 'operator' ? 'Operator' : e.speaker === 'contact' ? 'Contact' : '?';
      return `${who}: ${e.text ?? ''}`;
    })
    .join('\n');
}

export async function classifyTurn({
  tenantId,
  callId,
  recentEvents,
  callContext,
}: {
  tenantId: string;
  callId: string;
  recentEvents: Row<'call_events'>[];
  callContext?: CallContext;
}): Promise<Stage1Result> {
  const lastTurn = recentEvents[recentEvents.length - 1];
  if (!lastTurn || lastTurn.speaker !== 'contact') {
    return { suggest: false, reasoning: 'last_turn_not_contact' };
  }

  const contextSection =
    callContext && (callContext.callType || callContext.goal)
      ? `\n\nCall context (set by the agent before the call):\n- type: ${callContext.callType ?? 'unspecified'}\n- agent's goal: ${callContext.goal ?? 'unspecified'}\n\nLet this context influence what counts as a substantive turn — e.g. on a "discovery" call, prospect answers about budget or timeline are buying_signal even if phrased softly.`
      : '';

  const userPrompt = `Recent call turns (oldest first; the LAST line is the prospect utterance you must classify):

${formatRecentEvents(recentEvents)}${contextSection}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATE_TIMEOUT_MS);

  try {
    const res = await client().chat.completions.create(
      {
        model: MODELS.GATE,
        max_tokens: 200,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'stage1_classification',
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    // Fire-and-forget usage recording — never blocks the suggest path.
    recordUsage(tenantId, {
      model: MODELS.GATE,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      cachedInputTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    }).catch((err) =>
      logger.error(
        { err: err instanceof Error ? err.message : String(err), tenantId, callId },
        'recordUsage failed (gate)',
      ),
    );

    const raw = res.choices[0]?.message?.content;
    if (!raw) {
      logger.warn({ tenantId, callId }, 'gate returned empty content');
      return { suggest: false, reasoning: 'gate_empty' };
    }

    const parsed = RawSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      logger.warn(
        { tenantId, callId, err: parsed.error.issues[0]?.message },
        'gate JSON failed Zod validation',
      );
      return { suggest: false, reasoning: 'gate_invalid_json' };
    }

    if (!parsed.data.suggest) {
      return { suggest: false, reasoning: parsed.data.reasoning };
    }

    if (!parsed.data.intent) {
      // Model said suggest=true but didn't pick an intent — treat as drop.
      logger.warn({ tenantId, callId, raw }, 'gate suggest=true with null intent');
      return { suggest: false, reasoning: 'gate_invalid_intent' };
    }

    return {
      suggest: true,
      intent: parsed.data.intent,
      entities: parsed.data.entities,
      reasoning: parsed.data.reasoning,
    };
  } catch (err) {
    clearTimeout(timeout);
    // OpenAI SDK surfaces aborts as APIUserAbortError with message
    // "Request was aborted." — match either name or message.
    const aborted =
      err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
    logger.warn(
      {
        tenantId,
        callId,
        err: err instanceof Error ? err.message : String(err),
        aborted,
        timeoutMs: GATE_TIMEOUT_MS,
      },
      aborted ? 'gate timed out' : 'gate threw',
    );
    return { suggest: false, reasoning: aborted ? 'gate_timeout' : 'gate_error' };
  }
}
