-- =============================================================================
-- 0002_add_kb_chunk_title.sql
-- Adds a nullable title column to kb_chunks. The classifier (lib/ai/classify.ts)
-- generates a one-line summary at ingest time; the dashboard list view shows it.
-- =============================================================================

alter table kb_chunks
  add column if not exists title text;
