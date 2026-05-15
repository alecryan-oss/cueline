import Link from 'next/link';
import { cookies } from 'next/headers';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerClient } from '@/lib/db/client';
import { listKbChunks } from '@/lib/db/queries/kbChunks';
import type { Row } from '@/lib/db/types';
import { requireTenant } from '@/lib/tenant/context';
import { humanize } from '@/lib/utils';

import { DeleteChunkButton } from './delete-button';

export default async function KbListPage() {
  const { tenantId, role } = await requireTenant();

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const chunks = await listKbChunks(supabase, tenantId);

  const grouped = groupByPrimaryTag(chunks);
  const canEdit = role === 'owner' || role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge base</h1>
          <p className="text-sm text-muted-foreground">
            {chunks.length === 0
              ? 'No chunks yet. Add some to unlock live suggestions.'
              : `${chunks.length} chunk${chunks.length === 1 ? '' : 's'} indexed.`}
          </p>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href="/kb/new">Add content</Link>
          </Button>
        ) : null}
      </div>

      {chunks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Paste objection responses, discovery questions, or product facts to seed retrieval.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([tag, rows]) => (
            <section key={tag} className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {prettyTag(tag)} <span className="text-foreground/60">· {rows.length}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((row) => (
                  <ChunkCard key={row.id} chunk={row} canEdit={canEdit} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ChunkCard({ chunk, canEdit }: { chunk: Row<'kb_chunks'>; canEdit: boolean }) {
  const preview = chunk.content.slice(0, 150).trim();
  const hasMore = chunk.content.length > 150;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-medium">
          {chunk.title ?? 'Untitled chunk'}
        </CardTitle>
        {canEdit ? <DeleteChunkButton id={chunk.id} /> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {chunk.intent_tags.map((t) => (
            <Badge key={t} variant="secondary">
              {prettyTag(t)}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {preview}
          {hasMore ? '…' : ''}
        </p>
      </CardContent>
    </Card>
  );
}

function groupByPrimaryTag(rows: Row<'kb_chunks'>[]): Map<string, Row<'kb_chunks'>[]> {
  const map = new Map<string, Row<'kb_chunks'>[]>();
  for (const row of rows) {
    const key = row.intent_tags[0] ?? 'untagged';
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function prettyTag(tag: string): string {
  return humanize(tag);
}
