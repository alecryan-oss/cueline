-- =============================================================================
-- 0006_enable_realtime_suggestions.sql
-- Adds suggestions to the supabase_realtime publication so the live call view
-- receives both INSERT (new card placeholder) and UPDATE (streaming deltas)
-- broadcasts during a call.
-- =============================================================================

alter publication supabase_realtime add table suggestions;
