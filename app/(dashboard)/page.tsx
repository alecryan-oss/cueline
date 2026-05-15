import {
  ArrowRightIcon,
  BookOpenIcon,
  FlaskConicalIcon,
  PhoneIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { createServerClient } from '@/lib/db/client';
import { listCallsWithStats } from '@/lib/db/queries/calls';
import { listKbChunks } from '@/lib/db/queries/kbChunks';
import { env } from '@/lib/env';
import { checkCostCeiling } from '@/lib/tenant/billing';
import { requireTenant } from '@/lib/tenant/context';
import { humanize } from '@/lib/utils';

export default async function DashboardHomePage() {
  const { tenantId } = await requireTenant();
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const [usage, recentCalls, kbChunks] = await Promise.all([
    checkCostCeiling(tenantId),
    listCallsWithStats(supabase, tenantId, 5),
    listKbChunks(supabase, tenantId),
  ]);

  const pct =
    usage.ceiling > 0 ? Math.min(100, Math.round((usage.current / usage.ceiling) * 100)) : 0;

  // Bucket KB chunks by their primary intent tag.
  const intentBreakdown = new Map<string, number>();
  for (const c of kbChunks) {
    const tag = c.intent_tags[0] ?? 'untagged';
    intentBreakdown.set(tag, (intentBreakdown.get(tag) ?? 0) + 1);
  }
  const topIntents = [...intentBreakdown.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const mockEnabled =
    env.NODE_ENV === 'development' && env.ENABLE_MOCK_CALLS === 'true';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live call assist overview.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Recent calls */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Recent calls</CardTitle>
              <CardDescription>Last 5</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/calls">
                View all <ArrowRightIcon />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentCalls.length === 0 ? (
              <EmptyHint
                icon={<PhoneIcon className="size-5" />}
                title="No calls yet"
                cta={mockEnabled ? { href: '/calls/simulate', label: 'Run a mock call' } : undefined}
              />
            ) : (
              <ul className="-mx-2 space-y-0.5 text-sm">
                {recentCalls.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/call/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground">
                          {c.call_type ? humanize(c.call_type) : 'Untyped'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(c.started_at).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant={c.status === 'active' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {c.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* KB status */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Knowledge base</CardTitle>
              <CardDescription>{kbChunks.length} chunk{kbChunks.length === 1 ? '' : 's'}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/kb">
                Open <ArrowRightIcon />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {kbChunks.length === 0 ? (
              <EmptyHint
                icon={<BookOpenIcon className="size-5" />}
                title="Add objections + discovery questions"
                cta={{ href: '/kb/new', label: 'Add content' }}
              />
            ) : (
              <div className="flex flex-wrap gap-1">
                {topIntents.map(([tag, n]) => (
                  <Badge key={tag} variant="secondary" className="font-normal">
                    {humanize(tag)} <span className="ml-1 text-muted-foreground">{n}</span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This month&apos;s usage</CardTitle>
            <CardDescription>OpenAI cost across all calls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-2xl font-semibold tabular-nums">
                ${usage.current.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                of <span className="tabular-nums">${usage.ceiling.toFixed(2)}</span>
              </p>
            </div>
            <Progress value={pct} aria-label={`${pct}% of monthly ceiling used`} />
            {!usage.allowed ? (
              <p className="text-xs text-destructive">
                Ceiling reached. Suggestions paused — raise the limit in Settings.
              </p>
            ) : pct > 80 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Approaching the monthly ceiling.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {mockEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Try it now</CardTitle>
            <CardDescription>
              The simulator drives the full pipeline without a real Dialpad connection.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/calls/simulate">
                <FlaskConicalIcon /> Run a mock call
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/kb/new">Add KB content</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function EmptyHint({
  icon,
  title,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-2 text-sm text-muted-foreground">
      <span className="text-muted-foreground/60">{icon}</span>
      <p>{title}</p>
      {cta ? (
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-brand">
          <Link href={cta.href}>
            {cta.label} <ArrowRightIcon />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
