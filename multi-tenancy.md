# Multi-Tenancy

## Core principle

Every row in every domain table carries `tenant_id`. RLS is enabled on every table. The only code paths allowed to bypass RLS (via the Supabase service role key) are:

1. The Dialpad WS relay, which inserts `call_events` for the tenant it has already verified via `dialpad_account_id`.
2. The suggestion worker, which reads KB chunks and writes suggestions for the tenant it has already verified via the active call's `tenant_id`.

Everywhere else — Server Actions, Route Handlers serving the browser, RSCs — uses the **anon** Supabase client with the user's JWT, and RLS does the filtering.

## Schema (v1)

```sql
-- The tenants themselves
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dialpad_account_id text unique,        -- nullable until they OAuth
  plan text not null default 'free',
  monthly_cost_ceiling_usd numeric(10,2) not null default 50.00,
  created_at timestamptz not null default now()
);

-- Users belong to one tenant (for v1; multi-tenant users is v2)
create table tenant_members (
  user_id uuid references auth.users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  role text not null check (role in ('owner','admin','agent')),
  primary key (user_id, tenant_id)
);

-- Encrypted Dialpad credentials
create table tenant_integrations (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  dialpad_access_token_encrypted bytea,
  dialpad_refresh_token_encrypted bytea,
  dialpad_token_expires_at timestamptz,
  dialpad_subscription_id text,
  dialpad_websocket_id text,
  updated_at timestamptz not null default now()
);

-- A call (one row per Dialpad call leg we care about)
create table calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  dialpad_call_id text not null unique,
  agent_user_id uuid references auth.users(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('active','ended','dropped'))
);

-- Each transcript chunk + state event
create table call_events (
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
create index on call_events (call_id, occurred_at);

-- KB chunks for RAG
create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_document_id uuid,
  intent_tags text[] not null,           -- e.g. {'objection','pricing'}
  content text not null,
  embedding vector(1536),                -- adjust to chosen embedding model
  created_at timestamptz not null default now()
);
create index on kb_chunks using hnsw (embedding vector_cosine_ops);
create index on kb_chunks using gin (intent_tags);
create index on kb_chunks (tenant_id);

-- Generated suggestions (streamed deltas appended)
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  call_id uuid not null references calls(id) on delete cascade,
  triggered_by_event_id bigint references call_events(id),
  intent text,
  content text not null default '',      -- appended as Sonnet streams
  is_complete boolean not null default false,
  was_used boolean,                      -- agent feedback
  created_at timestamptz not null default now()
);
create index on suggestions (call_id, created_at);
```

## RLS policies — the templates

Every domain table follows the same shape:

```sql
alter table calls enable row level security;

-- Read: only your own tenant's rows
create policy "tenant read" on calls
  for select using (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );

-- Write: agents within the tenant can write
create policy "tenant write" on calls
  for insert with check (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );

-- Same pattern for update / delete, with role checks for admin-only ops
```

For `kb_chunks` specifically: only `owner` and `admin` can write; `agent` can read.

For `tenants` and `tenant_integrations`: only `owner` can update.

## Tenant resolution rules

**From a browser session (Server Action, Route Handler, RSC):**
```ts
const { user } = await supabase.auth.getUser();
const { tenantId } = await getActiveTenant(user.id);  // checks tenant_members
// Use tenantId. NEVER accept tenant_id from the request body.
```

**From a Dialpad event (WS relay):**
```ts
const tenant = await db
  .from('tenants')
  .select('id')
  .eq('dialpad_account_id', payload.company_id)
  .single();

if (!tenant.data) {
  log.warn('dialpad event for unknown tenant', { company_id: payload.company_id });
  return; // drop the event
}
```

**Never** default to a tenant. **Never** infer tenant from the call_id alone without first verifying the company_id matches.

## Cross-tenant query rules

Forbidden patterns (these will fail in code review):

```ts
// ❌ NO — missing tenant filter
await supabase.from('kb_chunks').select('*');

// ❌ NO — tenant_id from request body
async function bad(formData: FormData) {
  'use server';
  const tenantId = formData.get('tenant_id'); // attacker-controlled
  await db.from('calls').select('*').eq('tenant_id', tenantId);
}

// ❌ NO — vector search without tenant filter
await supabase.rpc('match_kb_chunks', { query_embedding, match_count: 5 });
```

Required patterns:

```ts
// ✅ tenant from session
const tenantId = await requireTenant();
await db.from('calls').select('*').eq('tenant_id', tenantId);

// ✅ vector search scoped to tenant
await supabase.rpc('match_kb_chunks', {
  query_embedding,
  match_count: 5,
  filter_tenant_id: tenantId,
  filter_intents: ['objection','pricing']
});
```

The `match_kb_chunks` Postgres function takes `filter_tenant_id` as a required parameter and applies it BEFORE the similarity sort, so the index can be used efficiently.

## Future: multi-tenant users

v1 assumes each user belongs to exactly one tenant. v2 will allow consultants who manage multiple tenants. When that happens:
- Add an "active tenant" selector to the UI.
- Persist active tenant in the user's session/cookie.
- All Server Actions read active tenant from the session, not from a query param.

Don't start designing for this in v1. It will complicate every Server Action for a use case we don't have yet.
