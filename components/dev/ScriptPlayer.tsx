'use client';

import {
  ChevronDownIcon,
  ChevronUpIcon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  endMockCall,
  injectMockEvent,
} from '@/app/(dashboard)/calls/simulate/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MOCK_TRANSCRIPTS, type MockTranscriptName, type MockTurn } from '@/lib/dev/mockTranscripts';
import { humanize } from '@/lib/utils';

type Status = 'playing' | 'paused' | 'stopped' | 'finished';

export function ScriptPlayer({
  callId,
  scriptName,
}: {
  callId: string;
  scriptName: MockTranscriptName;
}) {
  const script = MOCK_TRANSCRIPTS[scriptName];
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('playing');
  const [sent, setSent] = useState<Array<MockTurn & { ts: number }>>([]);
  const [collapsed, setCollapsed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== 'playing') return;
    if (index >= script.length) {
      setStatus('finished');
      void endMockCall(callId).then((r) => {
        if (r.ok) toast.success('Mock call ended.');
        else toast.error(r.error ?? 'Failed to end call.');
      });
      return;
    }

    const turn = script[index]!;
    timerRef.current = setTimeout(async () => {
      const result = await injectMockEvent({
        callId,
        speaker: turn.speaker,
        text: turn.text,
      });
      if (!result.ok) {
        toast.error(result.error);
        setStatus('stopped');
        return;
      }
      setSent((prev) => [...prev, { ...turn, ts: Date.now() }]);
      setIndex((i) => i + 1);
    }, turn.delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, status, script, callId]);

  const totalTurns = script.length;
  const remaining = Math.max(0, totalTurns - index);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            <span className="text-muted-foreground">Script:</span>{' '}
            <span>{humanize(scriptName)}</span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {sent.length}/{totalTurns} sent ·{' '}
            <Badge variant={status === 'playing' ? 'default' : 'secondary'} className="ml-0.5 text-[10px]">
              {status}
            </Badge>
          </p>
        </div>
        {collapsed ? <ChevronUpIcon className="size-4 shrink-0" /> : <ChevronDownIcon className="size-4 shrink-0" />}
      </button>

      {!collapsed ? (
        <div className="space-y-2 p-3">
          <div className="flex gap-2">
            {status === 'playing' ? (
              <Button size="xs" variant="outline" onClick={() => setStatus('paused')}>
                <PauseIcon /> Pause
              </Button>
            ) : null}
            {status === 'paused' ? (
              <Button size="xs" variant="outline" onClick={() => setStatus('playing')}>
                <PlayIcon /> Resume
              </Button>
            ) : null}
            {(status === 'playing' || status === 'paused') ? (
              <Button
                size="xs"
                variant="destructive"
                onClick={async () => {
                  if (timerRef.current) clearTimeout(timerRef.current);
                  setStatus('stopped');
                  const r = await endMockCall(callId);
                  if (r.ok) toast.success('Mock call ended.');
                  else toast.error(r.error ?? 'Failed to end call.');
                }}
              >
                <SquareIcon /> Stop
              </Button>
            ) : null}
            <span className="ml-auto self-center text-[11px] text-muted-foreground">
              {remaining} left
            </span>
          </div>

          {sent.length > 0 ? (
            <div className="max-h-48 space-y-0.5 overflow-y-auto rounded border bg-muted/30 p-2 text-[11px]">
              {sent.slice(-20).map((turn, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-14 shrink-0 font-mono text-muted-foreground">
                    {turn.speaker}
                  </span>
                  <span className="flex-1">{turn.text}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
