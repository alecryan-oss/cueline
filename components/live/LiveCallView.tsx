'use client';

import { MessagesSquareIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { createBrowserClient } from '@/lib/db/client';
import type { Row } from '@/lib/db/types';

import { CallHeader } from './CallHeader';
import { SuggestionCard } from './SuggestionCard';
import { TranscriptLine } from './TranscriptLine';

export function LiveCallView({
  call,
  initialEvents,
  initialSuggestions,
  canEndCall,
}: {
  call: Row<'calls'>;
  initialEvents: Row<'call_events'>[];
  initialSuggestions: Row<'suggestions'>[];
  canEndCall: boolean;
}) {
  const [events, setEvents] = useState<Row<'call_events'>[]>(initialEvents);
  const [suggestions, setSuggestions] = useState<Row<'suggestions'>[]>(initialSuggestions);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Two Realtime channels — one per table. Both use the user's session client,
  // so RLS still gates broadcasts: an unauthed listener gets nothing.
  useEffect(() => {
    const supabase = createBrowserClient();

    const eventsChannel = supabase
      .channel(`call_events:${call.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_events',
          filter: `call_id=eq.${call.id}`,
        },
        (payload) => {
          const newEvent = payload.new as Row<'call_events'>;
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [...prev, newEvent];
          });
        },
      )
      .subscribe();

    const suggestionsChannel = supabase
      .channel(`suggestions:${call.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'suggestions',
          filter: `call_id=eq.${call.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Row<'suggestions'>;
            setSuggestions((prev) =>
              prev.some((s) => s.id === inserted.id) ? prev : [inserted, ...prev],
            );
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Row<'suggestions'>;
            setSuggestions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Pick<Row<'suggestions'>, 'id'>;
            setSuggestions((prev) => prev.filter((s) => s.id !== deleted.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(eventsChannel);
      void supabase.removeChannel(suggestionsChannel);
    };
  }, [call.id]);

  // Auto-scroll the transcript to bottom on each new event.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <CallHeader call={call} canEnd={canEndCall} />
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[3fr_2fr]">
        <section
          ref={transcriptRef}
          className="overflow-y-auto border-r"
          aria-label="Transcript"
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/90 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
            <MessagesSquareIcon className="size-3.5" />
            Transcript
            {events.length > 0 ? (
              <span className="text-muted-foreground/60">· {events.length}</span>
            ) : null}
          </div>
          {events.length === 0 ? (
            <EmptyPanel
              icon={<MessagesSquareIcon className="size-6" />}
              title="Waiting for the first turn"
              hint="As your prospect speaks, transcript turns will stream in here."
            />
          ) : (
            <div className="divide-y px-4 py-2">
              {events.map((ev) => (
                <TranscriptLine key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </section>
        <aside className="overflow-y-auto bg-muted/20" aria-label="Suggestions">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/90 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
            <SparklesIcon className="size-3.5" />
            Suggestions
            {suggestions.length > 0 ? (
              <span className="text-muted-foreground/60">· {suggestions.length}</span>
            ) : null}
          </div>
          {suggestions.length === 0 ? (
            <EmptyPanel
              icon={<SparklesIcon className="size-6" />}
              title="Suggestions appear here"
              hint="When your prospect raises an objection, asks a question, or shows a buying signal, a card will stream in."
            />
          ) : (
            <div className="space-y-3 p-4">
              {suggestions.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="text-muted-foreground/40">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
