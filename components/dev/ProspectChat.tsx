'use client';

import { SendIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { sendProspectMessage } from '@/app/(live)/call/[callId]/prospect-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ProspectChat({
  callId,
  scenario,
  scenarioLabel,
}: {
  callId: string;
  scenario?: string;
  scenarioLabel?: string;
}) {
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();

  const handleSend = () => {
    const message = text.trim();
    if (!message || pending) return;
    setText('');
    startTransition(async () => {
      const result = await sendProspectMessage(callId, message, scenario);
      if (!result.ok) {
        toast.error(result.error);
        setText(message);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="truncate text-xs font-medium">
          <span className="text-muted-foreground">
            {scenarioLabel ? 'Training:' : 'AI prospect'}
          </span>
          {scenarioLabel ? <span className="ml-1">{scenarioLabel}</span> : null}
        </p>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {pending ? 'Prospect typing…' : 'Enter to send'}
        </span>
      </div>
      <div className="flex items-end gap-2 p-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Say something to the prospect…"
          className="min-h-[44px] resize-none text-sm"
          disabled={pending}
        />
        <Button onClick={handleSend} disabled={pending || !text.trim()} size="sm">
          <SendIcon />
        </Button>
      </div>
    </div>
  );
}
