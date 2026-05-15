'use client';

import { formatDistanceToNow } from 'date-fns';

import type { Row } from '@/lib/db/types';
import { cn } from '@/lib/utils';

const SPEAKER_LABEL: Record<string, string> = {
  operator: 'You',
  contact: 'Prospect',
};

const AVATAR_LETTER: Record<string, string> = {
  operator: 'Y',
  contact: 'P',
};

export function TranscriptLine({ event }: { event: Row<'call_events'> }) {
  const speaker = event.speaker ?? null;
  const label = speaker ? (SPEAKER_LABEL[speaker] ?? '—') : '—';
  const initial = speaker ? (AVATAR_LETTER[speaker] ?? '?') : '?';

  const isContact = speaker === 'contact';

  // Computed at render — refreshes when the parent re-renders on new events.
  const relative = formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true });

  return (
    <div
      className="group animate-in fade-in slide-in-from-bottom-1 flex items-start gap-3 px-1 py-2 duration-300"
      title={relative}
    >
      <div
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
          isContact
            ? 'bg-brand/10 text-brand ring-1 ring-brand/20'
            : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p
          className={cn(
            'mb-0.5 text-[10px] font-semibold uppercase tracking-wider',
            isContact ? 'text-brand' : 'text-muted-foreground',
          )}
        >
          {label}
        </p>
        <p className="text-sm leading-relaxed text-foreground">{event.text}</p>
      </div>
    </div>
  );
}
