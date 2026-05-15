-- =============================================================================
-- 0004_fix_tenant_members_rls_recursion.sql
-- The "owner read tenant" and "owner write" policies on tenant_members query
-- tenant_members from within their own USING clause, causing PostgreSQL error
-- 42P17 (infinite_recursion) on every SELECT against the table.
--
-- For v1 we don't expose a "list members" or "add member" UI, so the simpler
-- fix is to drop these policies. The "tenant_members: self read" policy still
-- lets each user see their own membership row, which is what requireTenant()
-- and getActiveTenant() need. Member management (when we build it) will go
-- through Server Actions using the service-role client, which bypasses RLS.
-- =============================================================================

drop policy if exists "tenant_members: owner read tenant" on tenant_members;
drop policy if exists "tenant_members: owner write" on tenant_members;
