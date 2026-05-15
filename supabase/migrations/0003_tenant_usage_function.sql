-- =============================================================================
-- 0003_tenant_usage_function.sql
-- Atomic upsert+increment for tenant_usage. Returns the tenant's month-to-date
-- total (USD) after the update so callers don't need a second round-trip.
--
-- Always called via the service-role client (the user-facing RLS policy on
-- tenant_usage is owner-only-read; there's no INSERT policy because writes
-- come from server-side workers only).
-- =============================================================================

create or replace function add_tenant_usage(
  p_tenant_id uuid,
  p_day date,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost numeric
) returns numeric
language sql
as $$
  insert into tenant_usage (tenant_id, day, input_tokens, output_tokens, total_usd, updated_at)
  values (p_tenant_id, p_day, p_input_tokens, p_output_tokens, p_cost, now())
  on conflict (tenant_id, day) do update set
    input_tokens  = tenant_usage.input_tokens  + excluded.input_tokens,
    output_tokens = tenant_usage.output_tokens + excluded.output_tokens,
    total_usd     = tenant_usage.total_usd     + excluded.total_usd,
    updated_at    = now();

  select coalesce(sum(total_usd), 0)::numeric
  from tenant_usage
  where tenant_id = p_tenant_id
    and day >= date_trunc('month', p_day::timestamp)::date;
$$;
