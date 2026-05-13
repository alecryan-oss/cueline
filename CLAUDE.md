# CLAUDE.md

> Project context and operating rules for Claude Code working on this repository.
> Read this file first on every new session. It is the source of truth — if anything
> here conflicts with assumptions from training data, this file wins.

---

## 1. What this project is

**Codename:** *Cueline* (working title — replace if renamed)
**One-liner:** A real-time agent-assist web app that listens to live Dialpad sales calls, streams AI-generated objection-handling and discovery-question suggestions to the sales agent during the conversation, sourced from a per-tenant knowledge base.

**Who it's for:** Sales agents and SDRs running outbound discovery calls. Built first for Proton Tech Lab / Extatic Design internal use, architected from day one as **multi-tenant SaaS** so it can be sold to clients later.

**The job:** During a live call, surface the right answer — case study, objection rebuttal, qualifying question, pricing line — as a card the agent can glance at and use. Latency target: **suggestion visible on screen ≤ 2 seconds after the prospect stops speaking**. If we miss that budget, the feature is dead weight.

---

## 2. Stack — locked decisions

These are not up for debate inside a normal feature task. If you think one needs to change, surface it as a question first.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, latest stable) | Server Actions + Route Handlers in one runtime |
| UI | Tailwind CSS + shadcn/ui | Standard, fast, looks decent by default |
| DB / Auth / Realtime | Supabase (Postgres + pgvector + Realtime + Auth) | One service covers vector search, row-level multi-tenancy, and the live transcript fan-out |
| Hosting | Vercel | Native Next.js, edge runtime where useful |
| LLM | Anthropic Claude API | Sonnet 4.6 for suggestion quality, Haiku 4.5 for low-latency gating |
| Telephony | Dialpad (WebSocket Event Subscriptions + REST) | v1 is **Dialpad-only**. Zoom/Meet are out of scope until v2. |

**Server Actions vs Route Handlers:**
- **Server Actions** for everything that is a mutation or one-shot RPC: KB CRUD, settings, call review notes, prompt template edits.
- **Route Handlers** for the live transcript pipeline (Dialpad WebSocket relay, Claude streaming response). Server Actions cannot stream — do not try to force them.
- No legacy `pages/api` routes anywhere.

---

## 3. Architecture at a glance

```
                        ┌──────────────────────┐
                        │   Dialpad Platform   │
                        └──────────┬───────────┘
                                   │ WebSocket events
                                   │ (call_transcription)
                                   ▼
       ┌─────────────────────────────────────────────────┐
       │   Next.js Route Handler  /api/dialpad/stream    │
       │   - validates JWT signature                     │
       │   - resolves tenant from call target            │
       │   - publishes transcript chunks to Supabase     │
       └────────────────────────┬────────────────────────┘
                                │ INSERT into call_events
                                ▼
                    ┌───────────────────────┐
                    │  Supabase (Postgres)  │
                    │  + Realtime channel   │
                    └───┬───────────────┬───┘
                        │               │
       ┌────────────────┘               └────────────────┐
       │ Realtime subscribe                              │ trigger
       ▼                                                 ▼
┌──────────────────────┐               ┌────────────────────────────┐
│  Agent Live View     │               │  Suggestion Worker         │
│  (Next.js client)    │◄──────────────│  Route Handler /api/suggest│
│  - rolling transcript│   Realtime    │  - turn detection (Haiku)  │
│  - suggestion cards  │   updates     │  - RAG over pgvector       │
└──────────────────────┘               │  - streams Sonnet response │
                                       └────────────────────────────┘
```

Full per-component detail: [docs/architecture.md](./docs/architecture.md)

---

## 4. Multi-tenant model (read this before writing any query)

Every domain row carries `tenant_id`. Row-Level Security (RLS) is enabled on **every** table. Bypassing RLS with the service role key is allowed only in the Dialpad webhook handler and the suggestion worker — both must explicitly scope every query to a verified `tenant_id`.

**Tenant resolution rules:**
- For incoming Dialpad events: resolve via `dialpad_account_id` → `tenants.dialpad_account_id`. If no match, drop the event and log it. Never default to a tenant.
- For browser sessions: tenant comes from the user's Supabase auth claim. Never trust a `tenant_id` from the request body.

**Forbidden patterns:**
- `select * from kb_chunks` without a tenant filter, anywhere, ever.
- Passing `tenant_id` from the client into a Server Action without re-deriving it from the session.
- Cross-tenant joins in vector search. The pgvector query must include `where tenant_id = $1` before the similarity sort.

Full schema and RLS policies: [docs/multi-tenancy.md](./docs/multi-tenancy.md)

---

## 5. Dialpad integration

v1 uses **WebSocket Event Subscriptions** (not the legacy webhook flow). The relevant event is `call_transcription` — Dialpad streams transcript chunks with speaker diarization while the call is live. We subscribe per-tenant after they authorize via OAuth.

Key behaviors to respect:
- WebSocket connections expire after **1 hour** — reconnection logic is mandatory, not optional.
- Only act on transcript chunks where `speaker == "contact"` (the prospect). Suggestions triggered by the agent's own speech are noise.
- Rate limit: 20 req/s per Dialpad company. Batch our REST calls accordingly.
- Recording/transcription requires explicit consent on the agent's account. Surface that in onboarding; do not paper over it.

Full event payloads, OAuth flow, scopes, and reconnection strategy: [docs/dialpad-integration.md](./docs/dialpad-integration.md)

---

## 6. The LLM pipeline

Two-model setup. **Do not collapse this into a single Sonnet call** — the cost and latency profile depends on the split.

**Stage 1 — Haiku 4.5 (gating + intent classification):**
Runs on every prospect-utterance turn. Decides:
- Is this a question, an objection, a buying signal, or filler? (classification)
- If filler → return `{ "suggest": false }` and stop. No Sonnet call, no UI update.
- If signal → extract intent + key entities, pass to Stage 2.

Haiku is fast (~80–120 tok/s, sub-second TTFT) and cheap. ~80% of turns should die here.

**Stage 2 — Sonnet 4.6 (suggestion generation):**
Only invoked when Stage 1 says `suggest: true`. Receives the intent label + top-k RAG chunks from pgvector and streams a suggestion card back. Stream the response — do not wait for completion before rendering.

**Prompt caching is mandatory.** The tenant's static system prompt, brand voice rules, and "always-on" KB context are cached (5-min TTL is enough for active calls). This is roughly a 10x cost reduction on input tokens during a sustained call.

**Model strings (use exact IDs, do not paraphrase):**
- `claude-sonnet-4-6` (current Sonnet)
- `claude-haiku-4-5` (current Haiku)

Full prompt structures, fallback behavior, and cost ceiling per tenant: [docs/llm-pipeline.md](./docs/llm-pipeline.md)

---

## 7. RAG / knowledge base

Per tenant, the KB is organized by **intent type**, not by document type. Chunks are tagged with one or more of: `objection`, `pricing`, `discovery_question`, `competitor`, `case_study`, `qualifying_criteria`, `product_fact`, `brand_voice`.

The Stage-2 retrieval filters by both `tenant_id` AND the intent label from Stage 1. Pulling competitor chunks when the prospect raised a pricing question wastes the context window and gives worse answers.

Embedding model and chunking strategy: [docs/rag.md](./docs/rag.md)

---

## 8. Coding rules

**TypeScript:** strict mode on. No `any` in committed code — if you need an escape hatch, use `unknown` and narrow it. Server Actions and Route Handlers always validate inputs with Zod before touching the database.

**Server vs client components:** Default to Server Components. A component only becomes a Client Component if it actually needs `useState`, `useEffect`, or an event handler. The live call view is a Client Component; almost nothing else should be.

**Data access:** All Supabase calls go through a thin wrapper in `lib/db/` that takes a verified tenant context. No raw `supabase.from(...)` calls in route handlers or actions.

**Streaming:** Use the Vercel AI SDK's streaming primitives (`streamText`, `useChat`-style hooks) for the Claude pipeline. Don't hand-roll SSE parsing unless there's a concrete reason.

**Error handling:** No silent catches. Every caught error is either re-thrown, logged with tenant + call context, or surfaced to the user with a useful message. `console.error('error', e)` is not acceptable.

**File size:** If a file passes ~300 lines, split it. If a Server Action passes ~80 lines, it's doing too much.

**Imports:** Absolute imports via `@/` only. No `../../../` chains.

**Naming:**
- DB tables: `snake_case`, plural (`call_events`, `kb_chunks`)
- TS types/interfaces: `PascalCase` (`CallEvent`, `KbChunk`)
- React components: `PascalCase` files (`LiveCallView.tsx`)
- Everything else: `camelCase`

---

## 9. What NOT to do

These have come up before or are easy traps. Don't:

- **Don't add Zoom or Google Meet support.** v1 is Dialpad-only. If a feature seems to require generalizing the audio source, stop and ask first.
- **Don't put the live transcript pipeline behind a Server Action.** They don't stream. This will look like it works in dev and fail under any real load.
- **Don't call Sonnet on every transcript chunk.** That's a $$ disaster and ruins latency. Gate with Haiku.
- **Don't store the full call audio.** Dialpad already does this. We store transcripts and our generated suggestions. Audio adds storage cost, compliance surface, and no value.
- **Don't show a suggestion for every prospect sentence.** The "trigger threshold" is intentional. If the agent is overwhelmed by cards, they stop looking.
- **Don't hardcode model strings inside business logic.** They live in `lib/ai/models.ts` so we can swap Sonnet 4.6 → 4.7 in one place.
- **Don't write to `kb_chunks` from a client component.** All writes go through Server Actions with Zod validation.
- **Don't create a fresh Supabase client per request inside loops.** Reuse the per-request client from `lib/db/client.ts`.

---

## 10. Folder layout

```
/app
  /(dashboard)              # tenant-scoped dashboard routes
    /kb                     # knowledge base editor
    /calls                  # call history + review
    /settings
  /(live)
    /call/[callId]          # the live agent-assist view
  /api
    /dialpad
      /oauth/callback       # OAuth handoff
      /stream               # WebSocket relay endpoint
    /suggest                # streaming suggestion endpoint
/lib
  /ai
    /models.ts              # model string constants
    /haiku-gate.ts          # Stage 1 classifier
    /sonnet-suggest.ts      # Stage 2 generator
    /prompts/               # cached system prompts per tenant
  /db
    /client.ts              # supabase client factory
    /queries/               # typed query helpers, all tenant-scoped
  /dialpad
    /client.ts              # REST + WS client
    /events.ts              # event type schemas (Zod)
  /tenant
    /context.ts             # tenant resolution helpers
/components
  /live                     # client components for the live view
  /kb                       # KB editor components
  /ui                       # shadcn primitives
/supabase
  /migrations               # SQL migrations, never edited in place
  /seed.sql
/docs                       # the deep-dive docs referenced above
```

---

## 11. Working agreements with the developer

- **Always ask before adding a new dependency.** Especially anything that touches auth, billing, or the AI pipeline.
- **Always show a migration before applying it.** Supabase migrations are append-only — no edits to old files.
- **When in doubt about Dialpad behavior, check [docs/dialpad-integration.md](./docs/dialpad-integration.md) first, then the live Dialpad docs at https://developers.dialpad.com.** Do not invent payload shapes.
- **When in doubt about Anthropic API behavior**, the docs at https://docs.claude.com are authoritative. Model names, parameter shapes, and feature availability change — verify, don't guess.
- **If a task requires more than ~5 files of changes, propose a plan first** before writing the code.

---

## 12. Deep-dive docs

| File | Covers |
|---|---|
| [docs/architecture.md](./docs/architecture.md) | End-to-end request flow, component responsibilities, latency budget |
| [docs/dialpad-integration.md](./docs/dialpad-integration.md) | OAuth scopes, WebSocket lifecycle, event payload schemas, reconnection |
| [docs/multi-tenancy.md](./docs/multi-tenancy.md) | DB schema, RLS policies, tenant resolution rules |
| [docs/llm-pipeline.md](./docs/llm-pipeline.md) | Two-stage prompt design, caching strategy, cost ceilings, fallback behavior |
| [docs/rag.md](./docs/rag.md) | Embedding model, chunking, intent tagging, retrieval filters |
