import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CallSetupDialog } from '@/components/dev/CallSetupDialog';
import { createServerClient } from '@/lib/db/client';
import { MOCK_TRANSCRIPT_NAMES } from '@/lib/dev/mockTranscripts';
import { env } from '@/lib/env';
import { requireTenant } from '@/lib/tenant/context';
import { humanize } from '@/lib/utils';

import {
  startAiProspectCall,
  startBlankMockCall,
  startScriptedMockCall,
  startVoiceProspectCall,
} from './actions';

export default async function SimulatePage() {
  if (env.NODE_ENV !== 'development' || env.ENABLE_MOCK_CALLS !== 'true') {
    redirect('/');
  }

  const { tenantId } = await requireTenant();
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const { data: rows } = await supabase
    .from('calls')
    .select('id, dialpad_call_id, started_at, ended_at, status, call_type, goal')
    .eq('tenant_id', tenantId)
    .like('dialpad_call_id', 'mock-%')
    .order('started_at', { ascending: false })
    .limit(20);

  const recent = rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mock calls</h1>
        <p className="text-sm text-muted-foreground">
          Local-only simulator. Each Start button opens a setup form so the suggestion
          pipeline knows what kind of call it&apos;s assisting.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Live AI prospect</CardTitle>
            <CardDescription>
              An AI plays a small business owner being pitched website services. Best test
              of the suggestion pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <CallSetupDialog
              triggerLabel="Type to chat"
              triggerClassName="w-full"
              action={startAiProspectCall}
            />
            <CallSetupDialog
              triggerLabel="🎤 Voice mode (Chrome/Edge)"
              triggerVariant="outline"
              triggerClassName="w-full"
              action={startVoiceProspectCall}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Play scripted call</CardTitle>
            <CardDescription>
              Pre-written transcripts replay turn-by-turn at the script&apos;s cadence.
              Setup form pre-biases the suggestion model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {MOCK_TRANSCRIPT_NAMES.map((name) => (
              <CallSetupDialog
                key={name}
                triggerLabel={`▶ ${humanize(name)}`}
                triggerVariant="outline"
                triggerClassName="w-full justify-start"
                action={startScriptedMockCall}
                hiddenFields={{ script: name }}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blank mock call</CardTitle>
            <CardDescription>
              Empty active call with no driver. For manually inspecting the live view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CallSetupDialog
              triggerLabel="Start blank mock call"
              triggerVariant="outline"
              action={startBlankMockCall}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent mock calls</CardTitle>
          <CardDescription>Last 20 mock calls in this tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No mock calls yet. Start one above to populate this list.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Dialpad ID</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Goal</th>
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-2 pr-4 font-mono text-xs">{c.dialpad_call_id}</td>
                      <td className="py-2 pr-4 text-xs">
                        {c.call_type ? humanize(c.call_type) : '—'}
                      </td>
                      <td className="max-w-[280px] truncate py-2 pr-4 text-xs text-muted-foreground">
                        {c.goal ?? '—'}
                      </td>
                      <td className="py-2 pr-4">{new Date(c.started_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/call/${c.id}`}>
                            {c.status === 'active' ? 'Resume' : 'Review'}
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
