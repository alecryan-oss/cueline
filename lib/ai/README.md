# lib/ai

OpenAI-only stack. No other LLM or embedding providers are wired in.

## Provider clients — pick the right one

We use **two** OpenAI client surfaces in this directory. The line between them
is "do you need streaming or structured output?" — yes → AI SDK; no → raw
client.

### `@ai-sdk/openai` (Vercel AI SDK)

Use for:

- **Structured output** via `generateObject` (Zod schema → JSON-mode response).
  See `classify.ts`.
- **Streaming** via `streamText` / `streamObject` for the live suggestion path.
  See future `suggest.ts`.
- Anywhere we want consistent provider-agnostic ergonomics.

The SDK exposes `usage` on the response with `inputTokens`, `outputTokens`,
and `cachedInputTokens` — pass these straight to `recordUsage`.

### Raw `openai` client

Use for:

- **Embeddings** (`embeddings.create`) — one-shot, naturally batched, no
  streaming. The raw response shape (`usage.prompt_tokens` +
  `usage.prompt_tokens_details.cached_tokens`) lines up 1:1 with our
  `recordUsage` call. See `embeddings.ts`.
- Any future one-shot call where we want the full OpenAI response object
  (e.g. for moderation flags, tool-use deltas, etc.).

## Usage tracking — non-negotiable

Every OpenAI call site in this directory **must** call `recordUsage(tenantId, ...)`
after a successful response. The function takes the verified `tenantId` (always
from `requireTenant()` or `resolveTenantByDialpadAccount()` upstream) and
upserts the cost into `tenant_usage` atomically via the `add_tenant_usage`
Postgres function (see `supabase/migrations/0003_*`).

This means every public function that triggers a paid call takes `tenantId` as
its first argument:

- `classifyChunk(tenantId, content)`
- `embedTexts(tenantId, texts)` / `embedText(tenantId, text)`

Don't make `tenantId` optional. Don't allow a "default" tenant. If a caller
doesn't have a verified tenantId, they're not allowed to spend money.

## Cost ceiling — check before spending

Before any block of paid work (KB ingest, suggestion generation), Server
Actions and workers should call `checkCostCeiling(tenantId)` from
`lib/tenant/billing.ts`. If `allowed: false`, return an error toast / disable
Stage 2 / log — see `docs/llm-pipeline.md` for the per-stage policy.

## Model strings

`models.ts` is the single source of truth. Don't inline model IDs anywhere
else. Re-check pricing in `pricing.ts` against
<https://platform.openai.com/docs/pricing> at integration time — OpenAI drops
prices roughly twice a year and we want the math to stay accurate.
