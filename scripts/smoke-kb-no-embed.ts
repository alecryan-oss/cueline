// KB smoke test WITHOUT embeddings. Exercises chunker → Haiku classify →
// kb_chunks insert with embedding=null. Use when no OpenAI key is configured.
// Retrieval (match_kb_chunks) won't match these until embeddings are filled in.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/smoke-kb-no-embed.ts

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import { chunkText } from '../lib/ai/chunk';
import { classifyChunk } from '../lib/ai/classify';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SAMPLE = `
Our pricing starts at $99 per seat per month for the Starter tier, billed
annually. Mid-market customers usually land on the Growth tier at $249 per
seat, which adds SSO, advanced analytics, and unlimited integrations.

When prospects say our pricing seems high, the most effective rebuttal is to
walk them through the cost of the alternative — typically the salary of a
half-time analyst. Most of our customers replace that role within a quarter.

A great discovery question to ask early is: "Walk me through the last time
your team had to rebuild a report from scratch. How long did it take?" The
answer almost always reveals where they're losing time today.
`.trim();

async function main() {
  const supabase = createClient(url, service);

  let tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    const { data } = await supabase
      .from('tenants')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1);
    tenantId = data?.[0]?.id;
    console.log(`> using most recent tenant: ${tenantId} (${data?.[0]?.name})`);
  }
  if (!tenantId) {
    console.error('No tenant found. Sign up an account first.');
    process.exit(1);
  }

  console.log('\n> chunkText');
  const chunks = chunkText(SAMPLE);
  console.log(`  produced ${chunks.length} chunk(s)`);

  console.log('\n> classifyChunk (Anthropic)');
  const t0 = Date.now();
  const classifications = await Promise.all(chunks.map((c) => classifyChunk(tenantId!, c)));
  console.log(`  done in ${Date.now() - t0}ms`);
  classifications.forEach((c, i) =>
    console.log(`  [${i}] title="${c.title}" tags=[${c.intent_tags.join(', ')}]`),
  );

  console.log('\n> insert into kb_chunks (embedding=null)');
  const rows = chunks.map((content, i) => ({
    tenant_id: tenantId!,
    title: classifications[i]!.title,
    content,
    intent_tags: classifications[i]!.intent_tags,
    embedding: null,
  }));
  const { data: inserted, error } = await supabase
    .from('kb_chunks')
    .insert(rows)
    .select('id, title, intent_tags');
  if (error) {
    console.error('insert failed:', error.message);
    process.exit(1);
  }
  console.log(`  inserted ${inserted?.length} row(s):`);
  inserted?.forEach((r) =>
    console.log(`  - ${r.id}  ${JSON.stringify(r.intent_tags)}  ${r.title}`),
  );

  console.log('\nSMOKE TEST PASSED (no embeddings)');
  console.log(`Cleanup SQL:`);
  console.log(`  delete from kb_chunks where id in (${inserted?.map((r) => `'${r.id}'`).join(',')});`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
