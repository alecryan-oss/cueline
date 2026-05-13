# Architecture

## End-to-end flow

A single prospect utterance during a live call traces this path:

1. **Prospect speaks** into their phone, Dialpad's softphone, or whatever endpoint they're on.
2. **Dialpad's transcription engine** produces a transcript chunk with speaker label, timestamp, and confidence. This typically lands within 300–800ms of the utterance.
3. Dialpad emits a `call_transcription` event over the **WebSocket Event Subscription** that our backend opened when the tenant authorized the integration.
4. Our **WS relay** (`/api/dialpad/stream` Route Handler, or a long-lived edge worker — see "Where the WS lives" below) receives the event, validates the JWT signature, resolves the tenant from the call metadata, and INSERTs the transcript chunk into `call_events`.
5. Supabase Realtime fans the row out to two subscribers:
   - The **agent's browser** (rolling transcript UI updates immediately).
   - The **suggestion worker** (`/api/suggest`), if the chunk is from the prospect (`speaker == "contact"`).
6. The suggestion worker runs **Stage 1 (Haiku)** — gating + intent classification. If filler, stop. ~80% of turns die here.
7. If Stage 1 says "suggest," **Stage 2 (Sonnet)** runs RAG over the tenant's KB chunks filtered by intent, then streams a response back via the worker, which writes streamed deltas to `suggestions`.
8. The agent's browser, subscribed to `suggestions` for the active call, **renders the card as it streams**.

## Latency budget

Total target: prospect stops talking → suggestion visible in ≤ **2.0 seconds**.

| Stage | Budget | Notes |
|---|---|---|
| Dialpad transcription | 300–800ms | Outside our control. Measure baseline per tenant. |
| WS relay → Postgres | <50ms | Single INSERT, no joins. |
| Realtime fanout | <100ms | Supabase Realtime is fast; the slow part is the client receiving the WebSocket frame. |
| Haiku gating (Stage 1) | 300–500ms | Sub-second TTFT, short output. |
| pgvector retrieval | <100ms | Pre-built HNSW index, scoped query. |
| Sonnet first token (Stage 2) | 500–800ms | This is when the card first appears with text streaming in. |
| **Total to first visible token** | **~1.3–2.3s** | Within budget for most turns. |

If you blow this budget consistently, the feature dies. Optimize in this order: (1) skip Sonnet via better Stage-1 classification, (2) shrink the retrieval set, (3) cache prompts, (4) move the worker to an edge region near the tenant.

## Where the WS lives

Vercel serverless functions are not suited for long-lived WebSocket connections to Dialpad. Two options, pick based on scale:

**Option A — v1 / single-tenant phase:** Run a small Node.js process on Fly.io, Railway, or Render that maintains the Dialpad WebSocket(s), validates events, and writes to Supabase. This is the recommended starting point. Cheap, simple, and Vercel doesn't need to know it exists.

**Option B — multi-tenant scale:** Same Node process, but sharded by tenant. One process can handle dozens of concurrent Dialpad WS connections. Move to this when v1 sees real client traffic.

The Next.js `/api/dialpad/stream` Route Handler exists for **outgoing browser → server** streaming (the suggestion endpoint), not for the long-lived Dialpad inbound. Don't confuse the two.

## Component responsibilities

**WS relay (separate Node service)**
- Open and maintain Dialpad WebSocket subscriptions per tenant.
- Validate JWT signatures on every event.
- Resolve tenant via `dialpad_account_id`.
- Insert transcript chunks into `call_events`.
- Reconnect on `socket.onclose` AND on a 55-minute timer (Dialpad cuts at 60).
- Emit nothing else. No business logic here.

**Suggestion worker (`/api/suggest` Route Handler)**
- Triggered by Supabase Realtime via a Database Function + pg_net call, OR polled from a lightweight queue. **Decide one and stick with it** — see [llm-pipeline.md](./llm-pipeline.md).
- Runs the two-stage Claude pipeline.
- Streams output back to Supabase, which fans out to the browser.

**Agent live view (`/(live)/call/[callId]`)**
- Client Component subscribed to `call_events` and `suggestions` filtered by `callId`.
- Renders rolling transcript on the left, suggestion cards on the right.
- Surfaces a "request help" button that forces a Stage-2 call regardless of Stage-1 gating.
- Logs which suggestions the agent acted on (button click) for later evaluation.

**Dashboard (`/(dashboard)/*`)**
- All Server Components except where interactivity is needed.
- KB editor, call history with full transcripts + which suggestions fired and which were used, settings, billing later.

## Failure modes to design for

- **Dialpad WS drops mid-call:** Agent should see a banner "transcript paused, reconnecting." Suggestions queue resumes after reconnect.
- **Claude API outage:** Live view shows "suggestions unavailable" without breaking the transcript view. Transcript is the floor; suggestions are extra.
- **Tenant exceeds cost ceiling:** Stage 2 is disabled, Stage 1 keeps running. Agent sees "daily limit reached" but the transcript keeps working.
- **Slow Sonnet response:** If first token doesn't arrive within 2.5s, mark the suggestion as "stale" client-side and dim it. The conversation has moved on.
