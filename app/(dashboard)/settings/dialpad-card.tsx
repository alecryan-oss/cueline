'use client';

import { CheckCircle2Icon, ExternalLinkIcon, PhoneOffIcon } from 'lucide-react';
import { useEffect, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { disconnectDialpad } from './dialpad-actions';

export type DialpadConnectionState = {
  connected: boolean;
  user_email: string | null;
  user_id: string | null;
  company_id: string | null;
  connected_at: string | null;
};

export function DialpadCard({
  state,
  canManage,
}: {
  state: DialpadConnectionState;
  canManage: boolean;
}) {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Surface OAuth callback result via query param.
  useEffect(() => {
    if (params.get('dialpad') === 'connected') toast.success('Dialpad connected.');
    const err = params.get('dialpad_error');
    if (err) toast.error(`Dialpad connection failed: ${err.replace(/_/g, ' ')}`);
  }, [params]);

  const handleDisconnect = () => {
    if (!confirm('Disconnect Dialpad? Live call assist will stop until you reconnect.')) return;
    startTransition(async () => {
      const result = await disconnectDialpad();
      if (result.ok) toast.success('Dialpad disconnected.');
      else toast.error(result.error ?? 'Failed to disconnect.');
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Dialpad
          {state.connected ? (
            <Badge className="bg-intent-buying/15 text-intent-buying">
              <CheckCircle2Icon className="size-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {state.connected
            ? 'Live call transcripts flow from your Dialpad account into Cueline.'
            : 'Connect Dialpad to get live AI suggestions during your real sales calls.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.connected ? (
          <>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{state.user_email ?? 'Connected user'}</p>
                  <p className="text-xs text-muted-foreground">
                    {state.user_id ? `Dialpad user · ${state.user_id}` : null}
                    {state.company_id ? ` · company ${state.company_id}` : null}
                  </p>
                </div>
                {state.connected_at ? (
                  <p className="text-xs text-muted-foreground">
                    since {new Date(state.connected_at).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
            </div>
            {canManage ? (
              <Button
                onClick={handleDisconnect}
                disabled={pending}
                variant="destructive"
                size="sm"
              >
                <PhoneOffIcon /> {pending ? 'Disconnecting…' : 'Disconnect Dialpad'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only the workspace owner can disconnect.
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {canManage ? (
              <Button asChild>
                <a href="/api/dialpad/oauth/start">
                  Connect Dialpad <ExternalLinkIcon />
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only the workspace owner can connect Dialpad.
              </p>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">How this works</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>You authorize Cueline in Dialpad&apos;s OAuth screen.</li>
                <li>We store an encrypted refresh token and identify your Dialpad user.</li>
                <li>
                  Your live calls stream into Cueline&apos;s suggestion pipeline. Suggestions
                  appear on the live call view.
                </li>
                <li>
                  Recording + transcription must be enabled in Dialpad Admin Settings — we
                  can&apos;t toggle that for you.
                </li>
              </ol>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
