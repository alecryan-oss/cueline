# RAG / Knowledge Base

## Why intent-based chunking, not document-based

Standard RAG chunks by paragraph or fixed token window, embeds everything, and retrieves top-k by cosine similarity. That works for "answer questions over my documents." It works badly for live sales assist because:

- The prospect says "your pricing seems high" → the agent needs a *pricing objection response*, not the pricing FAQ page.
- The prospect says "what does that integrate with?" → the agent needs a product fact, not a case study that mentions integrations.
- Top-k by raw similarity will mix all of these and the LLM has to sort it out under a tight latency budget.

So: chunks are tagged with their **intent type** at ingestion time, and retrieval is **filtered by intent first**, then ranked by similarity.

## Intent taxonomy (v1)

| Tag | What goes in it |
|---|---|
| `objection` | Rebuttals to common objections, grouped by type (price, timing, authority, need, competitor) |
| `pricing` | Plain-language pricing explanations and how to defend them |
| `discovery_question` | Questions the agent should ask to qualify or uncover need |
| `competitor` | How we compare to specific named competitors |
| `case_study` | Short-form success stories with named outcomes |
| `qualifying_criteria` | The tenant's ICP, deal-breakers, must-haves |
| `product_fact` | Specifications, integrations, capabilities |
| `brand_voice` | Tone rules, words to avoid, sample phrasings |

A chunk can carry multiple tags. `brand_voice` chunks are special — they're injected into Stage 2's system prompt as cached context, not retrieved per turn.

## Ingestion flow

1. Tenant admin uploads a document (PDF, DOCX, MD, plain text) or pastes text via the KB editor.
2. Server Action extracts text, splits into semantic chunks (~300–500 tokens each, with overlap on prose, no overlap on Q&A pairs).
3. For each chunk, run a **Claude Haiku** classification call that returns intent tags + a one-line title.
4. Generate embedding via the chosen embedding model (see below).
5. Insert into `kb_chunks` with tenant_id, intent_tags, content, embedding.

Cost note: classification at ingest is one-time per chunk. Cheap.

## Embedding model

Use **Voyage AI's `voyage-3-large`** or whatever Anthropic's currently-recommended embedding partner is at integration time — verify against https://docs.claude.com/en/docs/build-with-claude/embeddings. OpenAI's `text-embedding-3-small` is the fallback if Voyage isn't an option.

Set `vector(1536)` in the schema if using `text-embedding-3-small`. Adjust if the chosen model has a different dimension — and never mix dimensions in one table.

## Retrieval at suggestion time

The Postgres function:

```sql
create or replace function match_kb_chunks(
  query_embedding vector(1536),
  filter_tenant_id uuid,
  filter_intents text[],
  match_count int default 5
)
returns table (id uuid, content text, similarity float)
language sql stable as $$
  select id, content, 1 - (embedding <=> query_embedding) as similarity
  from kb_chunks
  where tenant_id = filter_tenant_id
    and intent_tags && filter_intents     -- array overlap
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

**The tenant filter goes in the WHERE, before the order-by.** This is mandatory both for correctness (no cross-tenant leakage) and performance (the HNSW index scans within the filtered subset).

## What to embed as the query

Don't embed the raw prospect utterance. Embed the **combined turn context + Stage 1's intent label**:

```
[intent: objection_pricing]
[entities: enterprise plan]
[recent turns:]
Agent: ...
Prospect: your pricing seems steep compared to what we're using now
```

This gives the embedding model the structured signal it needs to match well-tagged KB chunks. Raw utterances are noisy.

## How many chunks to retrieve

Stage 2's context budget: ~3K tokens for retrieved chunks, plus the conversation context, plus the cached system prompt. That fits about 5–8 well-sized chunks comfortably.

Default `match_count = 5`. Bump to 8 if Stage 1 intent is `competitor` (which often needs more comparison material). Don't go higher — quality degrades and latency increases.

## What goes in the cached system prompt (not retrieved)

Per tenant, the cached system prompt includes:
- Brand voice rules (`brand_voice` tagged chunks, concatenated).
- Always-on facts: 3-5 line product summary, pricing tier names, key differentiators.
- Hard rules: "Never quote a number not in this prompt or the retrieved chunks. Never invent customer names."

This is cached for 5 minutes per tenant. Refresh it (re-cache) when the tenant edits brand voice or always-on facts.

## When the KB is empty

A new tenant has no chunks. Stage 2 still runs, but with no retrieved chunks. The system prompt should make this graceful: "If you don't have enough information, suggest a clarifying question instead of guessing."

Surface this in the dashboard as a setup checklist: "Add at least 5 objection responses and 5 discovery questions to unlock suggestions."

## Re-embedding

When you change embedding models, every chunk's vector becomes incompatible. Plan:
- Store an `embedding_model_version` column on `kb_chunks`.
- Run re-embedding as a background job per tenant.
- Until a tenant's chunks finish re-embedding, query with the old model. After, switch.

Don't bulk-re-embed without a migration plan. It's a lot of API calls.
