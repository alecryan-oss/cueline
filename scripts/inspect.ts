import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: tenants } = await s
    .from('tenants')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });
  console.log('=== TENANTS ===');
  console.log(JSON.stringify(tenants, null, 2));

  const { data: sugg } = await s
    .from('suggestions')
    .select('id, tenant_id, content, intent, is_complete, created_at')
    .order('created_at', { ascending: false })
    .limit(15);
  console.log('\n=== RECENT SUGGESTIONS (all tenants) ===');
  console.log('count:', sugg?.length ?? 0);
  console.log(JSON.stringify(sugg, null, 2));

  const { data: calls } = await s
    .from('calls')
    .select('id, tenant_id, dialpad_call_id, status, started_at')
    .order('started_at', { ascending: false })
    .limit(5);
  console.log('\n=== RECENT CALLS ===');
  console.log(JSON.stringify(calls, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
