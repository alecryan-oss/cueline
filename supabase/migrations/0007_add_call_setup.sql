-- =============================================================================
-- 0007_add_call_setup.sql
-- Adds pre-call setup metadata to the calls table. The agent specifies the
-- type of call (discovery, sales, etc.) and a one-line goal before the call
-- starts; the gate + suggestion prompts use these to bias toward relevance.
-- Both nullable — older calls + the WS-relay flow (which won't have this
-- info) just omit them.
-- =============================================================================

alter table calls
  add column if not exists call_type text,
  add column if not exists goal text;
