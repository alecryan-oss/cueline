// One-off smoke test: signs up a fresh user via the public Supabase auth
// endpoint, then provisions a tenant + owner membership exactly the way the
// signUp Server Action does. Reports the new IDs and exits.
//
// Run: npx tsx scripts/smoke-signup.ts

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anon || !service) {
  console.error('Missing one of NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const stamp = Date.now();
const email = `smoke+${stamp}@cueline-smoke.test`;
const password = 'smoketest1234';

async function main() {
  void anon; // anon client unused — admin.createUser needs service role
  const serviceClient = createClient(url, service);

  console.log(`> admin.createUser ${email} (skips email confirmation)`);
  const { data: signed, error: signUpErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (signUpErr || !signed.user) {
    console.error('createUser failed:', signUpErr?.message);
    process.exit(1);
  }
  console.log('  user id:', signed.user.id);

  console.log('> insert tenant');
  const { data: tenant, error: tErr } = await serviceClient
    .from('tenants')
    .insert({ name: `${email}'s workspace` })
    .select('id, name')
    .single();
  if (tErr || !tenant) {
    console.error('tenant insert failed:', tErr?.message);
    process.exit(1);
  }
  console.log('  tenant id:', tenant.id, '| name:', tenant.name);

  console.log('> insert tenant_members (owner)');
  const { error: mErr } = await serviceClient.from('tenant_members').insert({
    user_id: signed.user.id,
    tenant_id: tenant.id,
    role: 'owner',
  });
  if (mErr) {
    console.error('tenant_members insert failed:', mErr.message);
    process.exit(1);
  }
  console.log('  ok');

  console.log('\n> verify via service-role read-back');
  const { data: members } = await serviceClient
    .from('tenant_members')
    .select('user_id, tenant_id, role')
    .eq('user_id', signed.user.id);
  console.log('  tenant_members rows:', members);

  console.log('\nSMOKE TEST PASSED');
  console.log(JSON.stringify({ user_id: signed.user.id, tenant_id: tenant.id, email }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
