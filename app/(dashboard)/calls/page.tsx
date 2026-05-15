import Link from 'next/link';
import { cookies } from 'next/headers';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createServerClient } from '@/lib/db/client';
import { listCallsWithStats, type CallWithStats } from '@/lib/db/queries/calls';
import { env } from '@/lib/env';
import { requireTenant } from '@/lib/tenant/context';
import { humanize } from '@/lib/utils';

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function prettyType(t: string | null): string {
  return t ? humanize(t) : '—';
}

export default async function CallsListPage() {
  const { tenantId } = await requireTenant();
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const calls = await listCallsWithStats(supabase, tenantId, 50);
  const mockEnabled =
    env.NODE_ENV === 'development' && env.ENABLE_MOCK_CALLS === 'true';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calls</h1>
          <p className="text-sm text-muted-foreground">
            {calls.length === 0
              ? 'No calls yet.'
              : `Showing the last ${calls.length} call${calls.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        {mockEnabled ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/calls/simulate">Run a mock call →</Link>
          </Button>
        ) : null}
      </div>

      {calls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm font-medium">No calls yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Calls will appear here once Dialpad is connected.
              {mockEnabled
                ? ' For now, drive a mock call from the simulator.'
                : ''}
            </p>
            {mockEnabled ? (
              <Button asChild size="sm" variant="outline" className="mt-1">
                <Link href="/calls/simulate">Run a mock call →</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Goal</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Cards</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <CallRow key={c.id} call={c} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CallRow({ call }: { call: CallWithStats }) {
  const isMock = call.dialpad_call_id.startsWith('mock-');
  return (
    <tr className="border-b transition-colors last:border-0 hover:bg-muted/30">
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2">
          <span>{new Date(call.started_at).toLocaleString()}</span>
          {isMock ? (
            <Badge variant="outline" className="text-[10px]">
              mock
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {call.call_type ? (
          <span className="text-foreground">{prettyType(call.call_type)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="max-w-[320px] truncate px-4 py-3 text-muted-foreground">
        {call.goal ?? '—'}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums">
        {formatDuration(call.started_at, call.ended_at)}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Badge
          variant={
            call.status === 'active'
              ? 'default'
              : call.status === 'dropped'
                ? 'destructive'
                : 'secondary'
          }
        >
          {call.status}
        </Badge>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="font-medium">{call.suggestion_count}</span>
        {call.used_count > 0 ? (
          <span className="text-xs text-muted-foreground"> · {call.used_count} used</span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/call/${call.id}`}>
            {call.status === 'active' ? 'Resume →' : 'Review →'}
          </Link>
        </Button>
      </td>
    </tr>
  );
}
