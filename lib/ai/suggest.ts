import OpenAI from 'openai';

import { createServiceClient } from '@/lib/db/client';
import { listBrandVoiceChunks } from '@/lib/db/queries/kbChunks';
import type { Row } from '@/lib/db/types';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

import { embedText } from './embeddings';
import type { IntentLabel } from './gate';
import { intentTagsForIntent } from './intentTags';
import { MODELS } from './models';
import { recordUsage } from './usage';
import { searchKbChunks } from '@/lib/db/queries/kbChunks';

const STREAM_FLUSH_INTERVAL_MS = 100;
const FIRST_TOKEN_TIMEOUT_MS = 2500;
const MAX_OUTPUT_TOKENS = 400;

// In-flight Stage 2 streams keyed by call_id. When a newer prospect chunk
// arrives during an active stream, the route reuses the suggestion row and
// re-invokes generateSuggestion; we abort the prior stream so the writer
// stops touching the row before the new one starts.
//
// Module-scoped Map — works in dev (single Node process) and per-instance
// in serverless. Cross-instance races are acceptable for v1; a single
// abort would just lose to a concurrent winner.
const inFlightControllers = new Map<string, AbortController>();

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

// Long static prefix — intentionally >1024 tokens so OpenAI's automatic prompt
// cache hits during a sustained call. Per docs/llm-pipeline.md, we keep this
// prefix STABLE across requests; volatile content (current intent, retrieved
// chunks, transcript) goes into the user message.
const SYSTEM_PROMPT_BASE = `You are Cueline, a real-time sales-call assist. The agent on the call is mid-conversation with a prospect; you have one job: produce ONE high-quality suggestion the agent can read in under 5 seconds and use immediately.

# Voice and tone
- Speak as a senior sales coach in the agent's ear. Direct. Concrete. Not flowery.
- Imperative or declarative voice. Never narrate ("the prospect just said…", "I would suggest…").
- No preamble. No "Here's what to do". No "The best response is". Just the suggestion content itself, ready to be spoken or paraphrased.
- Match the tenant's brand voice from the section below.
- If the retrieved chunks don't actually answer what the prospect needs, suggest a clarifying question instead of guessing.

# Hard rules — non-negotiable
1. NEVER invent specifics. If a number, customer name, integration, capability, date, or guarantee isn't in the system context or the retrieved chunks below, do NOT include it. Suggest the agent ask the prospect or check with the team.
2. NEVER quote a price not present in the retrieved chunks.
3. NEVER reference a customer story, case study, or named brand not present in the retrieved chunks.
4. NEVER claim product capabilities, integrations, or limits not present in the retrieved chunks.
5. NEVER suggest hard-close tactics, urgency manufacture, or guilt. This is a coach, not a high-pressure script.
6. NEVER output JSON, markdown headers, or bullet points. Plain prose with line breaks.
7. ONE suggestion. Not three options. The agent doesn't have time to pick.

# Output structure
Respond with EXACTLY one suggestion card in this shape:

Line 1: A short headline — what to say or do, 5–12 words. Action-oriented.
Lines 2–4: Two to four short sentences the agent can paraphrase or read verbatim. Use the retrieved chunks as source material; cite numbers and names ONLY from those chunks.
Line 5 (optional): A single follow-up question to keep the conversation moving forward.

Plain text only. Line breaks between sections. No section headers, no bullets, no markdown.

# What "good" looks like

Example A — pricing objection
"Reframe the price against what they're paying for analyst hours."
The Growth tier replaces the half-time analyst most teams burn on manual reporting. Customers we work with typically recover that headcount cost within a quarter. Want me to walk through the math against your current setup?

Example B — discovery question about integrations
"Lead with what we cover today, then qualify their stack."
We integrate natively with Dialpad on the call side, plus HubSpot, Salesforce, and Outreach on the CRM side. Zoom and Meet are on the v2 roadmap. What does your team use today?

Example C — buying signal with a Q1 timeline
"Lock the timeline and identify the rest of the room."
For a Q1 start we'd need contracts signed by mid-December and onboarding kicked off the first week of January. Who else is involved when you make a decision like this — VP Sales, RevOps, procurement?

Example D — competitor mention
"Acknowledge the competitor, then differentiate on the live-assist piece."
The other tool covers post-call analytics well; where Cueline is different is the in-call coaching the agent sees while the prospect is still on the line. That's the gap most teams care about. Have you seen a live demo yet?

# Always-on context
This tenant uses Cueline to assist outbound sales reps. The agent is the operator on the call. The contact is the prospect. You are reacting to the prospect's most recent utterance, not the entire conversation history — the recent history is for context only. Always speak as if the agent will use your suggestion in the next 1-2 seconds.

# Tenant brand voice`;

function buildSystemPrompt(brandVoice: string): string {
  // brandVoice is concatenated content of the tenant's brand_voice KB chunks.
  // If empty, default to a neutral note so the prompt stays a stable prefix.
  const voiceSection = brandVoice.trim() || 'No tenant-specific voice rules — use a professional, plain, warm tone.';
  return `${SYSTEM_PROMPT_BASE}\n${voiceSection}`;
}

function formatChunks(chunks: { content: string }[]): string {
  if (chunks.length === 0) return '(no retrieved chunks — suggest a clarifying question)';
  return chunks.map((c, i) => `Source ${i + 1}:\n${c.content}`).join('\n\n');
}

function formatRecentEvents(events: Row<'call_events'>[]): string {
  return events
    .map((e) => {
      const who = e.speaker === 'operator' ? 'Operator' : e.speaker === 'contact' ? 'Contact' : '?';
      return `${who}: ${e.text ?? ''}`;
    })
    .join('\n');
}

export async function generateSuggestion({
  tenantId,
  callId,
  suggestionId,
  intent,
  entities,
  recentEvents,
  callContext,
}: {
  tenantId: string;
  callId: string;
  suggestionId: string;
  intent: IntentLabel;
  entities?: string[];
  recentEvents: Row<'call_events'>[];
  callContext?: { callType: string | null; goal: string | null };
}): Promise<void> {
  const supabase = createServiceClient();

  // 1. Build retrieval query: structured signal works better than the raw
  //    utterance for matching well-tagged KB chunks (per docs/rag.md).
  const last3 = recentEvents.slice(-3);
  const queryText = [
    `Intent: ${intent}`,
    entities && entities.length > 0 ? `Entities: ${entities.join(', ')}` : '',
    'Recent turns:',
    formatRecentEvents(last3),
  ]
    .filter(Boolean)
    .join('\n');

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(tenantId, queryText);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), tenantId, callId, suggestionId },
      'generateSuggestion: embed failed',
    );
    await supabase
      .from('suggestions')
      .update({ content: '[unavailable]', is_complete: true, intent })
      .eq('id', suggestionId);
    return;
  }

  // 2. RAG over the tenant's KB, intent-tag-filtered.
  const tags = intentTagsForIntent(intent);
  const matchCount = intent === 'objection_competitor' ? 8 : 5;
  let chunks: Awaited<ReturnType<typeof searchKbChunks>> = [];
  try {
    chunks = await searchKbChunks(supabase, tenantId, queryEmbedding, tags, matchCount);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), tenantId, intent },
      'generateSuggestion: RAG retrieval failed',
    );
    // Degrade gracefully — proceed with no chunks.
  }

  // 3. Tenant brand voice for the cached system prompt prefix.
  let brandVoice = '';
  try {
    const bv = await listBrandVoiceChunks(supabase, tenantId);
    brandVoice = bv.map((c) => c.content).join('\n\n');
  } catch {
    // Non-fatal — fall back to neutral voice.
  }

  const systemPrompt = buildSystemPrompt(brandVoice);

  const callContextSection =
    callContext && (callContext.callType || callContext.goal)
      ? `# This call's setup
Type: ${callContext.callType ?? 'unspecified'}
Agent's goal: ${callContext.goal ?? 'unspecified'}

`
      : '';

  const userPrompt = `${callContextSection}# Intent (from Stage 1)
${intent}${entities && entities.length > 0 ? `\nEntities: ${entities.join(', ')}` : ''}

# Retrieved KB chunks
${formatChunks(chunks)}

# Recent conversation (oldest first)
${formatRecentEvents(recentEvents.slice(-8))}

Based on the prospect's most recent utterance, output the suggestion card now. Steer the suggestion toward the agent's goal above when it's relevant.`;

  // 4. Set up an AbortController for this run; cancel any prior in-flight
  //    stream for the same call (Replace pattern — newer context wins).
  const prior = inFlightControllers.get(callId);
  if (prior) {
    prior.abort();
  }
  const controller = new AbortController();
  inFlightControllers.set(callId, controller);

  let totalContent = '';
  let lastFlushAt = Date.now();
  let firstTokenAt: number | null = null;

  const firstTokenTimer = setTimeout(() => {
    if (firstTokenAt === null) {
      logger.warn(
        { tenantId, callId, suggestionId, timeoutMs: FIRST_TOKEN_TIMEOUT_MS },
        'first token timeout',
      );
    }
  }, FIRST_TOKEN_TIMEOUT_MS);

  async function flush() {
    const { error } = await supabase
      .from('suggestions')
      .update({ content: totalContent })
      .eq('id', suggestionId);
    if (error) {
      logger.error(
        { err: error.message, suggestionId },
        'generateSuggestion: stream flush update failed',
      );
    }
    lastFlushAt = Date.now();
  }

  try {
    const stream = await client().chat.completions.create(
      {
        model: MODELS.SUGGEST,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.4,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { signal: controller.signal },
    );

    let lastUsage: OpenAI.CompletionUsage | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        if (firstTokenAt === null) firstTokenAt = Date.now();
        totalContent += delta;
        if (Date.now() - lastFlushAt >= STREAM_FLUSH_INTERVAL_MS) {
          await flush();
        }
      }
      if (chunk.usage) {
        lastUsage = chunk.usage;
      }
    }
    clearTimeout(firstTokenTimer);

    // Final write: persist any tail content + mark complete.
    const { error: finalErr } = await supabase
      .from('suggestions')
      .update({ content: totalContent, is_complete: true, intent })
      .eq('id', suggestionId);
    if (finalErr) {
      logger.error(
        { err: finalErr.message, suggestionId },
        'generateSuggestion: final update failed',
      );
    }

    if (lastUsage) {
      recordUsage(tenantId, {
        model: MODELS.SUGGEST,
        inputTokens: lastUsage.prompt_tokens ?? 0,
        outputTokens: lastUsage.completion_tokens ?? 0,
        cachedInputTokens: lastUsage.prompt_tokens_details?.cached_tokens ?? 0,
      }).catch((err) =>
        logger.error(
          { err: err instanceof Error ? err.message : String(err), tenantId, callId, suggestionId },
          'recordUsage failed (suggest)',
        ),
      );
    }
  } catch (err) {
    clearTimeout(firstTokenTimer);
    const aborted =
      err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
    if (aborted) {
      // A newer Stage 2 took over — leave the row alone, the new stream owns it.
      logger.debug(
        { tenantId, callId, suggestionId },
        'generateSuggestion aborted (replaced by newer)',
      );
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: msg, tenantId, callId, suggestionId, intent },
        'generateSuggestion: stream failed',
      );
      await supabase
        .from('suggestions')
        .update({
          content: totalContent || '[unavailable]',
          is_complete: true,
          intent,
        })
        .eq('id', suggestionId);
    }
  } finally {
    // Only clear if we're still the registered controller. A newer call may
    // have already replaced us in the map.
    if (inFlightControllers.get(callId) === controller) {
      inFlightControllers.delete(callId);
    }
  }
}
