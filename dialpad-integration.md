# Dialpad Integration

> Authoritative source: https://developers.dialpad.com
> This doc captures what we've decided about how *we* use Dialpad, not a copy of their docs.

## Why WebSocket events, not webhooks

Dialpad offers two event delivery mechanisms: HTTP webhooks and WebSocket subscriptions. We use **WebSocket subscriptions** because:

1. They deliver the same events as webhooks (including `call_transcription`) without requiring a publicly reachable HTTP endpoint.
2. Lower latency — no HTTP request/response overhead per event.
3. We don't need to manage public webhook URLs per tenant.

Trade-off: we maintain long-lived connections in a Node service (see [architecture.md](./architecture.md)), which is more complex than a stateless webhook endpoint. Worth it for the latency.

## OAuth setup

Tenants authorize via Dialpad OAuth. The flow:

1. Tenant clicks "Connect Dialpad" in our dashboard.
2. We redirect to Dialpad's authorize URL with our `client_id` and required scopes.
3. Dialpad redirects to `/api/dialpad/oauth/callback` with an authorization code.
4. We exchange the code for `access_token` + `refresh_token` and store them encrypted in `tenant_integrations`.
5. We then call Dialpad's API to:
   - Create a WebSocket entity (returns a `websocket_url`).
   - Create an event subscription scoped to the tenant's company/office with `call_transcription` and `connected`/`hangup` events.
6. Our Node WS relay opens a connection to that `websocket_url` and starts receiving events.

**Required scopes:**
- `recordings_export` — if we ever surface the recording URL (currently no, but reserve it).
- The transcription-related scopes (verify against current Dialpad docs at setup time — these have been renamed once already).

**Token refresh:** refresh tokens before each WS reconnect cycle. Don't wait for a 401.

## The events we care about

We subscribe to these `state` values on call event subscriptions:

| Event state | What we do |
|---|---|
| `connected` | Create a `calls` row, mark it active, push to agent's live view. |
| `call_transcription` | Append chunk to `call_events`. Trigger suggestion worker if `speaker == "contact"`. |
| `hangup` | Mark `calls` row as ended, stop suggestion pipeline, kick off post-call summary job. |

Everything else (ringing, voicemail, recap_summary, etc.) we ignore for v1.

## Event payload shape (what we depend on)

Dialpad event payloads are JWT-encoded (verify with the shared secret). After decode, the fields we read:

```jsonc
{
  "call_id": "string",                  // primary key for the call leg
  "entry_point_call_id": "string",      // useful for transferred-call scenarios
  "state": "call_transcription",        // see table above
  "target": {
    "id": "string",                     // dialpad office / user / call center id
    "type": "office" | "user" | "callcenter"
  },
  "company_id": "string",               // we map this to tenant_id
  "transcription": {
    "text": "string",                   // the chunk
    "speaker": "contact" | "operator",  // operator == our agent, contact == prospect
    "speaker_id": "string",             // dialpad user id when operator
    "timestamp": 1234567890.123,        // unix seconds, float
    "confidence": 0.94
  }
}
```

**Do not assume fields are always present.** Dialpad's own docs warn that fields vary by event type. Schema-validate every payload with Zod in `lib/dialpad/events.ts`. Drop and log anything that doesn't parse.

## Speaker labels

- `operator` = the Dialpad user (our agent). Their speech is for the rolling transcript only — never triggers a suggestion.
- `contact` = the external party (the prospect). Their speech triggers Stage 1 gating.

If a chunk arrives without a speaker label, treat it as `operator` (the safer default — better to under-suggest than to spam).

## Connection lifecycle (this is the part that bites people)

Dialpad WebSocket connections **expire after 1 hour**. The relay must:

1. Track a `connected_at` timestamp per WS.
2. At 55 minutes, proactively fetch a fresh URL via `GET /websockets/{id}` and open a new connection.
3. Once the new connection is open AND receiving events, close the old one.
4. Never close the old one before the new one is confirmed — otherwise we drop events during the swap.
5. Also subscribe to `socket.onclose`. If it fires unexpectedly, reconnect immediately with exponential backoff (1s, 2s, 4s, capped at 30s).

There's a deprecated WS service at `platform-websockets.uw.r.appspot.com` — do not use it. Always use the current `/websockets` API to get URLs.

## Rate limits

- **20 requests per second per company** across all REST endpoints. Applies at the company level, not per API key — multiple keys don't help.
- We mostly use REST for setup (creating subscriptions, refreshing tokens, fetching post-call data). The hot path is the WS, which doesn't count against this limit.
- Implement a token-bucket limiter in `lib/dialpad/client.ts`. On 429, backoff with `Retry-After` if present.

## Consent + compliance

Dialpad transcription requires the call to have transcription enabled. Some regions (US two-party consent states, EU) require explicit disclosure to the prospect. We do not handle that legal layer — but we **must** make it visible in onboarding that the tenant is responsible for their own consent disclosures, and the agent's outbound script should include the disclosure when required.

Build a checkbox in onboarding: "I confirm my team's calls comply with applicable recording/transcription consent laws." Store the timestamp + user id. Not legal advice, but it's the minimum diligence.

## What we don't use (yet)

- **Recap summary / action items / playbooks** — Dialpad's own post-call AI. Not needed for live assist. May surface later in the dashboard as a comparison.
- **Recording URLs** — we link out to Dialpad's recording rather than storing audio.
- **SMS events** — out of scope.
- **The legacy webhook flow** — see top of this doc.
