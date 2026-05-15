-- =============================================================================
-- 0008_dialpad_integration_columns.sql
-- Refit tenant_integrations for the OAuth-flow-based Dialpad connect:
--
-- 1. Switch the encrypted-token columns from `bytea` to `text` so we can store
--    a base64 ciphertext directly via supabase-js without bytea/hex juggling.
--    The 0001 columns are unused (no rows have ever been inserted) so we drop
--    + recreate as text rather than convert.
--
-- 2. Add identity + status columns we need for the Settings UI:
--    - dialpad_user_id     : the connected Dialpad user, used as target_id
--                            on per-user event subscriptions
--    - dialpad_user_email  : display only
--    - dialpad_company_id  : Dialpad's company UUID; we map this to tenant_id
--                            on inbound events (see docs/dialpad-integration.md)
--    - connected_at        : when the OAuth flow last completed
-- =============================================================================

alter table tenant_integrations
  drop column if exists dialpad_access_token_encrypted,
  drop column if exists dialpad_refresh_token_encrypted;

alter table tenant_integrations
  add column if not exists dialpad_access_token_encrypted text,
  add column if not exists dialpad_refresh_token_encrypted text,
  add column if not exists dialpad_user_id text,
  add column if not exists dialpad_user_email text,
  add column if not exists dialpad_company_id text,
  add column if not exists connected_at timestamptz;

create unique index if not exists tenant_integrations_dialpad_company_id_idx
  on tenant_integrations (dialpad_company_id)
  where dialpad_company_id is not null;
