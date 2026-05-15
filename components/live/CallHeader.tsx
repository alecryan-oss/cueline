'use client';

import { CircleIcon, PhoneOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { endMockCall } from '@/app/(dashboard)/calls/simulate/actions';
import { Button } from '@/components/ui/button';
import type { Row } from '@/lib/db/types';
import { useElapsedTime } from '@/lib/hooks/useElapsedTime';
import { cn, humanize } from '@/lib/utils';

export function CallHeader({
  call,
  canEnd,
}: {
  call: Row<'calls'>;
  canEnd: boolean;
}) {
  const router = useRouter();
  const [ending, startEnding] = useTransition();
  const elapsed = useElapsedTime(call.started_at, call.ended_at);

  const isActive = call.status === 'active';
  const isDropped = call.status === 'dropped';

  const handleEnd = () => {
    startEnding(async () => {
      const result = await endMockCall(call.id);
      if (result.ok) {
        toast.success('Call ended.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to end call.');
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b bg-background/80 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider',
            isActive
              ? 'bg-brand/10 text-brand'
              : isDropped
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {isActive ? (
            <CircleIcon className="size-2 animate-pulse-soft fill-current" />
          ) : (
            <CircleIcon className="size-2 fill-current" />
          )}
          {call.status}
        </span>
        <span className="font-mono text-base tabular-nums">{elapsed}</span>
        {call.call_type ? (
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {humanize(call.call_type)}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-xs text-muted-foreground md:inline">
          {call.dialpad_call_id}
        </span>
        {canEnd && isActive ? (
          <Button size="sm" variant="destructive" onClick={handleEnd} disabled={ending}>
            <PhoneOffIcon /> {ending ? 'Ending…' : 'End call'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
