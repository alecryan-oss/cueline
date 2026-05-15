// Single source of truth for the LLM/embedding model IDs the app uses.
// Per CLAUDE.md §6: never inline a model string anywhere else.
//
// Provider: OpenAI (single-provider stack — see CLAUDE.md §2).
//   - GATE: low-latency, low-cost classifier for the live-call gating step
//     (Stage 1) and KB ingest classification.
//   - SUGGEST: full-quality streaming model for the live suggestion step
//     (Stage 2).
//   - EMBEDDING: 1536-dim embeddings for KB ingest + query-time vector search
//     (matches the kb_chunks.embedding column type).
export const MODELS = {
  GATE: 'gpt-4o-mini',
  SUGGEST: 'gpt-4o',
  EMBEDDING: 'text-embedding-3-small',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
