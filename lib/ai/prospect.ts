// Dev-only AI prospect for live conversation testing.
// Streams a response from gpt-4o-mini in the persona of a small business
// owner being cold-called about web design services. The streamed response
// is split into ~5–10 word chunks (sentence-aware) and emitted via the
// `onChunk` callback so callers can inject each chunk as a separate
// `contact` call_event — same shape Dialpad would deliver in real life.
//
// Persona is picked deterministically from `callId` so the same call always
// gets the same persona across requests.

import OpenAI from 'openai';

import type { Row } from '@/lib/db/types';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

import { MODELS } from './models';
import { recordUsage } from './usage';

const PERSONAS = [
  {
    label: 'restaurant',
    description:
      'You run a small neighborhood restaurant. Your current website is essentially a menu page and a phone number from 2017. You handle orders by phone; some customers complain they can\'t order online. You\'re skeptical of agencies — your last "marketing guy" charged $400/month for not much. You\'re busy, often interrupted, and you\'re not technical at all.',
  },
  {
    label: 'dental_practice',
    description:
      'You manage a two-dentist practice. Your website is on a hosted dental-template platform that costs $200/month. It barely loads on mobile and patients have started complaining. The dentists want online booking integrated; you have no idea what that involves. You\'ve been burned by a freelancer who ghosted mid-project two years ago.',
  },
  {
    label: 'consultant',
    description:
      'You\'re a freelance management consultant. Your site is a basic Squarespace page you built in an afternoon two years ago. You\'re trying to land bigger enterprise clients and feel the site doesn\'t look credible enough. You\'re tight on cash but understand the value of credibility. You\'re moderately tech-savvy and skeptical of fluffy agency-speak.',
  },
  {
    label: 'ecommerce',
    description:
      'You own a Shopify store selling handmade leather goods. Your conversion rate is mediocre and you suspect the site looks dated. You\'ve looked at custom builds before but the quotes were $25k+. You\'re cautious about cost but willing to spend if you can see the ROI math. You ask sharp questions about pricing, integrations, and case studies.',
  },
] as const;

export type ProspectPersona = (typeof PERSONAS)[number];

export function pickPersona(callId: string): ProspectPersona {
  // Deterministic — same call → same persona across requests.
  const hash = [...callId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PERSONAS[hash % PERSONAS.length]!;
}

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

const SYSTEM_PROMPT_BASE = `You are role-playing as a prospective customer being cold-called by Cueline, a web design and development agency selling website services.

# Your persona
{PERSONA}

# How you respond
- Sound like a real human on a call. Short responses. Filler ("Yeah", "Mm-hm", "Right", "Okay") between substantive points.
- Don't dump your whole story in one message. Reveal information gradually as the agent earns it with good questions.
- React naturally to what the agent JUST said — don't volunteer unrelated info.
- Mix turn types over the course of the call: filler acknowledgments, brief answers, occasional substantive answers, occasional objections (price, timing, "we already have someone"), and rare buying signals if the agent is doing well.
- DO NOT be enthusiastic or close-ready. You're a normal busy prospect.
- Keep each reply under 25 words MOST of the time. Sometimes 5 words. Occasionally 30–40 words for substantive answers.
- Never narrate ("the prospect chuckles"). Never break character.
- No markdown. No formatting. Plain conversational text only.

# Hard rules
- NEVER say you're an AI or an assistant.
- NEVER suggest you're role-playing.
- Stay in persona for the whole call.

Now respond to the agent's most recent message based on the conversation so far. Output ONLY what the prospect would say — no narration, no "Prospect:" prefix, just the words.`;

function formatHistory(events: Row<'call_events'>[]): string {
  return events
    .filter((e) => e.text && e.speaker)
    .map((e) => `${e.speaker === 'operator' ? 'Agent' : 'Prospect'}: ${e.text}`)
    .join('\n');
}

/**
 * Stream a prospect reply, emitting it in ~5–10 word chunks via `onChunk`.
 * Chunks split at sentence boundaries when possible, otherwise at the
 * 8th word. This mimics how Dialpad delivers transcript fragments.
 *
 * `personaOverride` lets the training mode swap in a specific scenario
 * (e.g. "tire kicker") instead of the default callId-deterministic pick.
 */
export async function generateProspectReplyStream({
  tenantId,
  callId,
  recentEvents,
  onChunk,
  personaOverride,
}: {
  tenantId: string;
  callId: string;
  recentEvents: Row<'call_events'>[];
  onChunk: (text: string) => Promise<void>;
  personaOverride?: string;
}): Promise<void> {
  const personaText = personaOverride ?? pickPersona(callId).description;
  const systemPrompt = SYSTEM_PROMPT_BASE.replace('{PERSONA}', personaText);

  let buffer = '';
  let pendingFlush: Promise<void> = Promise.resolve();

  function shouldFlush(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    const endsAtSentence = /[.!?,]$/.test(trimmed);
    return words.length >= 8 || (endsAtSentence && words.length >= 4);
  }

  try {
    const stream = await client().chat.completions.create({
      model: MODELS.GATE, // gpt-4o-mini — cheap & fast for prospect generation
      max_tokens: 200,
      temperature: 0.85,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Conversation so far (oldest first; the LAST line is the agent's most recent message you must respond to):\n\n${formatHistory(recentEvents)}`,
        },
      ],
    });

    let lastUsage: OpenAI.CompletionUsage | undefined;

    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        buffer += delta;
        if (shouldFlush(buffer)) {
          const chunk = buffer.trim();
          buffer = '';
          // Serialize emissions so injects happen in order even if onChunk is async.
          pendingFlush = pendingFlush.then(() => onChunk(chunk));
        }
      }
      if (part.usage) lastUsage = part.usage;
    }

    // Tail: anything left in buffer goes as the final chunk.
    const tail = buffer.trim();
    if (tail) {
      pendingFlush = pendingFlush.then(() => onChunk(tail));
    }
    await pendingFlush;

    if (lastUsage) {
      recordUsage(tenantId, {
        model: MODELS.GATE,
        inputTokens: lastUsage.prompt_tokens ?? 0,
        outputTokens: lastUsage.completion_tokens ?? 0,
        cachedInputTokens: lastUsage.prompt_tokens_details?.cached_tokens ?? 0,
      }).catch((err) =>
        logger.error(
          { err: err instanceof Error ? err.message : String(err), tenantId, callId },
          'recordUsage failed (prospect)',
        ),
      );
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), tenantId, callId },
      'generateProspectReplyStream failed',
    );
    throw err;
  }
}
