-- =============================================================================
-- 0001_initial_schema.sql
-- Initial Cueline schema: tenants, members, integrations, calls, transcripts,
-- KB chunks (pgvector), suggestions, and per-tenant usage tracking.
--
-- Sources of truth: docs/multi-tenancy.md, docs/rag.md.
-- =============================================================================

-- 1. Extensions ---------------------------------------------------------------
create extension if not exists vector;

-- 2. Tables -------------------------------------------------------------------

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dialpad_account_id text unique,
  plan text not null default 'free',
  monthly_cost_ceiling_usd numeric(10,2) not null default 50.00,
  created_at timestamptz not null default now()
);

create table if not exists tenant_members (
  user_id uuid references auth.users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  role text not null check (role in ('owner','admin','agent')),
  primary key (user_id, tenant_id)
);

create table if not exists tenant_integrations (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  dialpad_access_token_encrypted bytea,
  dialpad_refresh_token_encrypted bytea,
  dialpad_token_expires_at timestamptz,
  dialpad_subscription_id text,
  dialpad_websocket_id text,
  updated_at timestamptz not null default now()
);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  dialpad_call_id text not null unique,
  agent_user_id uuid references auth.users(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('active','ended','dropped'))
);

create table if not exists call_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  call_id uuid not null references calls(id) on delete cascade,
  speaker text check (speaker in ('contact','operator')),
  text text,
  confidence real,
  occurred_at timestamptz not null,
  event_state text not null,
  created_at timestamptz not null default now()
);

create table if not exists kb_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_document_id uuid,
  intent_tags text[] not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  call_id uuid not null references calls(id) on delete cascade,
  triggered_by_event_id bigint references call_events(id),
  intent text,
  content text not null default '',
  is_complete boolean not null default false,
  was_used boolean,
  created_at timestamptz not null default now()
);

-- Per-tenant cost-ceiling tracking. One row per tenant per UTC day.
create table if not exists tenant_usage (
  tenant_id uuid not null references tenants(id) on delete cascade,
  day date not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_usd numeric(10,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, day)
);

-- 3. Indexes ------------------------------------------------------------------

create index if not exists call_events_call_id_occurred_at_idx
  on call_events (call_id, occurred_at);

create index if not exists kb_chunks_embedding_hnsw_idx
  on kb_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists kb_chunks_intent_tags_gin_idx
  on kb_chunks using gin (intent_tags);

create index if not exists kb_chunks_tenant_id_idx
  on kb_chunks (tenant_id);

create index if not exists suggestions_call_id_created_at_idx
  on suggestions (call_id, created_at);

-- 4. Retrieval function (docs/rag.md) -----------------------------------------
-- Tenant filter is in WHERE before ORDER BY so HNSW scans within the filtered
-- subset. Mandatory for both correctness (no cross-tenant leakage) and perf.
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
    and intent_tags && filter_intents
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Row-Level Security -------------------------------------------------------

alter table tenants              enable row level security;
alter table tenant_members       enable row level security;
alter table tenant_integrations  enable row level security;
alter table calls                enable row level security;
alter table call_events          enable row level security;
alter table kb_chunks            enable row level security;
alter table suggestions          enable row level security;
alter table tenant_usage         enable row level security;

-- Helper predicates reused below:
--   member of tenant : tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
--   role within tenant: tenant_id in (select tenant_id from tenant_members where user_id = auth.uid() and role = any($roles))

-- ---- tenants ----------------------------------------------------------------
-- Any member can read their tenant. Only owner can update. No client inserts /
-- deletes (provisioning happens via service role during signup).
drop policy if exists "tenants: members read" on tenants;
create policy "tenants: members read" on tenants
  for select using (
    id in (select tenant_id from tenant_members where user_id = auth.uid())
  );

drop policy if exists "tenants: owner update" on tenants;
create policy "tenants: owner update" on tenants
  for update using (
    id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  ) with check (
    id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ---- tenant_members ---------------------------------------------------------
-- A user can read their own membership rows. Owners can read all rows for
-- their tenant and manage members.
drop policy if exists "tenant_members: self read" on tenant_members;
create policy "tenant_members: self read" on tenant_members
  for select using (user_id = auth.uid());

drop policy if exists "tenant_members: owner read tenant" on tenant_members;
create policy "tenant_members: owner read tenant" on tenant_members
  for select using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

drop policy if exists "tenant_members: owner write" on tenant_members;
create policy "tenant_members: owner write" on tenant_members
  for all using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  ) with check (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ---- tenant_integrations ----------------------------------------------------
-- Owner-only read and write. Encrypted Dialpad credentials must never be
-- visible to admins/agents.
drop policy if exists "tenant_integrations: owner read" on tenant_integrations;
create policy "tenant_integrations: owner read" on tenant_integrations
  for select using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

drop policy if exists "tenant_integrations: owner write" on tenant_integrations;
create policy "tenant_integrations: owner write" on tenant_integrations
  for all using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  ) with check (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ---- calls ------------------------------------------------------------------
-- Any member of the tenant can read calls (call history is shared visibility).
-- Inserts come from the WS relay (service role); browser writes are limited
-- to updates from owners/admins (e.g. tagging, notes).
drop policy if exists "calls: tenant read" on calls;
create policy "calls: tenant read" on calls
  for select using (
    tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
  );

drop policy if exists "calls: admin update" on calls;
create policy "calls: admin update" on calls
  for update using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  ) with check (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- ---- call_events ------------------------------------------------------------
-- Read-only for tenant members. All writes go through the service role.
drop policy if exists "call_events: tenant read" on call_events;
create policy "call_events: tenant read" on call_events
  for select using (
    tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
  );

-- ---- kb_chunks --------------------------------------------------------------
-- Agents can read chunks for their tenant. Only owner/admin can write
-- (insert/update/delete).
drop policy if exists "kb_chunks: tenant read" on kb_chunks;
create policy "kb_chunks: tenant read" on kb_chunks
  for select using (
    tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
  );

drop policy if exists "kb_chunks: admin insert" on kb_chunks;
create policy "kb_chunks: admin insert" on kb_chunks
  for insert with check (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

drop policy if exists "kb_chunks: admin update" on kb_chunks;
create policy "kb_chunks: admin update" on kb_chunks
  for update using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  ) with check (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

drop policy if exists "kb_chunks: admin delete" on kb_chunks;
create policy "kb_chunks: admin delete" on kb_chunks
  for delete using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- ---- suggestions ------------------------------------------------------------
-- Read for any tenant member (live view + history). Writes are service-role
-- only (suggestion worker streams deltas). Browser-side feedback (was_used)
-- can come from any agent on the tenant.
drop policy if exists "suggestions: tenant read" on suggestions;
create policy "suggestions: tenant read" on suggestions
  for select using (
    tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
  );

drop policy if exists "suggestions: tenant feedback update" on suggestions;
create policy "suggestions: tenant feedback update" on suggestions
  for update using (
    tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
  ) with check (
    tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
  );

-- ---- tenant_usage -----------------------------------------------------------
-- Owner-only read. Writes are service-role only (usage worker tallies tokens).
drop policy if exists "tenant_usage: owner read" on tenant_usage;
create policy "tenant_usage: owner read" on tenant_usage
  for select using (
    tenant_id in (
      select tenant_id from tenant_members
      where user_id = auth.uid() and role = 'owner'
    )
  );
