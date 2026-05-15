-- =============================================================================
-- 0005_enable_realtime_call_events.sql
-- Adds call_events to the supabase_realtime publication so the live call view
-- receives INSERT broadcasts as the WS relay (or dev simulator) writes turns.
--
-- RLS still applies: clients only receive rows their JWT can SELECT, which
-- the "call_events: tenant read" policy from migration 0001 enforces.
-- =============================================================================

alter publication supabase_realtime add table call_events;
