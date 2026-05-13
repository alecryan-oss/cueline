# LLM Pipeline

> Anthropic API docs: https://docs.claude.com
> Verify model names + parameter shapes against current docs at integration time. They change.

## Two-stage design — why

The naive design is: every prospect utterance → Sonnet call → render response. This fails on two axes:

1. **Cost.** Sonnet 4.6 is $3 / $15 per 1M tokens. A 30-minute call with 50 prospect turns at 2K input tokens each (transcript + RAG + system prompt) is ~$0.30 *per call* before caching, scaling linearly with call volume. Multi-tenant clients will not accept this.
2. **Noise.** Most prospect turns aren't questions or objections — they're acknowledgments, filler, small talk. Generating a suggestion for "yeah, mm-hm, right" is worse than useless; it trains the agent to ignore the panel.

The two-stage pipeline solves both:

- **Stage 1 (Haiku 4.5):** Cheap classifier. ~$1 / $5 per 1M tokens, sub-second TTFT, kills ~80% of turns before any expensive work happens.
- **Stage 2 (Sonnet 4.6):** Only invoked when Stage 1 says "suggest." Streams the response.

## Stage 1 — Haiku gating

**Input:** the last prospect utterance + the previous ~10 turns for context.
**Output:** a small JSON object, no streaming.

```ts
type Stage1Result = {
  suggest: boolean;
  intent?:
    | 'objection_pricing'
    | 'objection_timing'
    | 'objection_authority'
    | 'objection_need'
    | 'objection_competitor'
    | 'discovery_question'
    | 'buying_signal'
    | 'request_for_info';
  entities?: string[];     // e.g. ["enterprise plan", "Q3"]
  reasoning?: string;      // one short sentence, for debugging
};
```

**System prompt (cached):** Defines the intent taxonomy + says "only suggest when intent is one of [...] and confidence is high. Default to suggest: false."

**Constraints:**
- `max_tokens: 200`. Output is JSON only.
- No streaming. Wait for the whole response, then decide.
- Timeout: 800ms. On timeout, default to `suggest: false`. The transcript keeps flowing.

**Where it runs:** Same Route Handler as Stage 2 (`/api/suggest`), called sequentially. Keeps the path simple.

## Stage 2 — Sonnet suggestion

**Input:**
- Tenant-specific cached system prompt: brand voice, do/don't list, "always-on" facts (top-line product summary, pricing tiers in plain language).
- Conversation context: previous ~10 turns of transcript.
- Stage 1's intent label and entities.
- Top-k RAG chunks filtered by `intent_tags` matching Stage 1's intent.

**Output:** Streamed text. A single suggestion card, formatted as:

```
[One-line summary of what to say or ask]

[2-4 sentence elaboration the agent can paraphrase, OR a verbatim line they can read]

[Optional: 1-line follow-up question]
```

**Constraints:**
- `max_tokens: 400`. Suggestions should be readable in 5 seconds.
- `stream: true`. Stream deltas straight into the `suggestions.content` row via an append-only update.
- Temperature: 0.4. Sales suggestions need to be slightly varied but not creative-writing wild.
- Timeout for first token: 2.5s. If exceeded, mark suggestion `is_complete = true, content = '[suggestion timed out]'` and dim it client-side.

## Prompt caching

Use Anthropic's prompt caching aggressively. The tenant's system prompt + brand voice + always-on facts go into a cached block with a 5-minute TTL. During an active call, every Stage 2 call within 5 minutes pays 10% of input price for that block. Active calls are continuous, so the cache stays warm.

Cache writes cost 1.25x base input price; reads cost 10%. Break-even is one read after one write, so this is a near-pure win for any tenant with calls lasting longer than one turn.

The cached prefix is *per tenant*. Do not share cache blocks across tenants.

## Model strings — single source of truth

Put model IDs in `lib/ai/models.ts`:

```ts
export const MODELS = {
  GATE: 'claude-haiku-4-5',
  SUGGEST: 'claude-sonnet-4-6',
} as const;
```

Never inline a model string elsewhere. When Anthropic ships a new Sonnet or Haiku, we update one file.

## Cost ceiling per tenant

Each tenant has `monthly_cost_ceiling_usd`. Track cumulative spend per tenant per month in a `tenant_usage` table (one row per day, updated with input/output token counts × pricing).

When the ceiling is hit:
- Stage 2 (Sonnet) is disabled — Stage 1 keeps classifying for analytics, but no suggestions are generated.
- Surface "AI suggestions paused — billing limit reached. [Upgrade]" in the live view.
- Owner gets an email.
- Resume on the 1st of the next month or when the ceiling is raised.

Default ceiling for new tenants: $50/month. Adjustable per tenant.

## Fallback behavior

| Scenario | Behavior |
|---|---|
| Haiku 5xx error | Skip Stage 2 for this turn. Log. |
| Haiku times out (>800ms) | Treat as `suggest: false`. Log. |
| Sonnet 5xx error | Mark suggestion `is_complete = true` with content `'[unavailable]'`. Log. |
| Sonnet TTFT > 2.5s | Same as above. The turn is dead. |
| Tenant over cost ceiling | Skip Stage 2 entirely, render banner. |
| Dialpad WS dropped | Pipeline stops naturally — no events, no suggestions. UI shows "transcript paused." |

Never let an LLM failure break the rolling transcript. The transcript is the floor.

## Trigger mechanism — Realtime → worker

Decision: **Database trigger + pg_net** OR **client-side invocation from the WS relay**? 

Pick **client-side invocation from the WS relay** for v1:

- After inserting a `call_events` row with `speaker='contact'`, the relay process makes an HTTP POST to `/api/suggest` with the `call_id` and `event_id`.
- The Route Handler runs the two-stage pipeline.
- Simpler to reason about and debug. No DB triggers, no pg_net, no extra moving parts.

Revisit if we move to a fully Vercel-hosted architecture later.

## Evaluation

Log every Stage 1 decision (suggest yes/no + intent + latency) and every Stage 2 output (content + token counts + latency). When agents click "use this" or "dismiss," store it. Build a `/(dashboard)/quality` page that shows:

- % of prospect turns that triggered a suggestion.
- % of suggestions the agent used.
- Median latency for each stage.
- Cost per call.

These metrics drive prompt iteration. Don't iterate the prompts without data.
