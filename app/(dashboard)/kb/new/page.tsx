import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireTenant } from '@/lib/tenant/context';

import { PasteEditor } from './paste-editor';

export default async function KbNewPage() {
  const { role } = await requireTenant();
  if (role !== 'owner' && role !== 'admin') {
    redirect('/kb');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add knowledge</h1>
        <p className="text-sm text-muted-foreground">
          Paste objection responses, discovery questions, product facts, or playbook excerpts.
          Cueline classifies and chunks them for live retrieval.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Paste content</CardTitle>
          <CardDescription>
            ~300–500 token chunks with one-sentence overlap on prose. You&apos;ll review every
            generated chunk before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasteEditor />
        </CardContent>
      </Card>
    </div>
  );
}
