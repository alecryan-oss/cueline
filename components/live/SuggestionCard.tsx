'use client';

import { CheckIcon, SparklesIcon, XIcon } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { markSuggestionFeedback } from '@/app/(live)/call/[callId]/feedback-actions';
import { Button } from '@/components/ui/button';
import type { Row } from '@/lib/db/types';
import { cn } from '@/lib/utils';

const STALE_AFTER_MS = 30_000;

type IntentVisual = {
  ribbon: string;
  pill: string;
  label: string;
};

const INTENT_VISUALS: Record<string, IntentVisual> = {
  objection_pricing: { ribbon: 'bg-intent-objection', pill: 'text-intent-objection', label: 'Pricing objection' },
  objection_timing: { ribbon: 'bg-intent-objection', pill: 'text-intent-objection', label: 'Timing objection' },
  objection_authority: { ribbon: 'bg-intent-objection', pill: 'text-intent-objection', label: 'Authority objection' },
  objection_need: { ribbon: 'bg-intent-objection', pill: 'text-intent-objection', label: 'Need objection' },
  objection_competitor: { ribbon: 'bg-intent-objection', pill: 'text-intent-objection', label: 'Competitor mention' },
  discovery_question: { ribbon: 'bg-intent-discovery', pill: 'text-intent-discovery', label: 'Discovery question' },
  buying_signal: { ribbon: 'bg-intent-buying', pill: 'text-intent-buying', label: 'Buying signal' },
  request_for_info: { ribbon: 'bg-intent-info', pill: 'text-intent-info', label: 'Info request' },
};

function intentVisual(intent: string | null): IntentVisual {
  if (intent && intent in INTENT_VISUALS) return INTENT_VISUALS[intent]!;
  return { ribbon: 'bg-muted-foreground/40', pill: 'text-muted-foreground', label: intent ?? 'Suggestion' };
}

function useIsStale(createdAt: string, thresholdMs: number): boolean {
  const elapsed = () => Date.now() - new Date(createdAt).getTime();
  const [stale, setStale] = useState<boolean>(() => elapsed() > thresholdMs);
  useEffect(() => {
    if (stale) return;
    const remaining = thresholdMs - elapsed();
    if (remaining <= 0) {
      setStale(true);
      return;
    }
    const t = setTimeout(() => setStale(true), remaining);
    return () => clearTimeout(t);
  }, [createdAt, thresholdMs, stale]);
  return stale;
}

export function SuggestionCard({ suggestion }: { suggestion: Row<'suggestions'> }) {
  const stale = useIsStale(suggestion.created_at, STALE_AFTER_MS);
  const visual = intentVisual(suggestion.intent);
  const [feedback, setFeedback] = useState<boolean | null>(suggestion.was_used);
  const [pending, startTransition] = useTransition();

  const send = (wasUsed: boolean) => {
    setFeedback(wasUsed);
    startTransition(async () => {
      const result = await markSuggestionFeedback(suggestion.id, wasUsed);
      if (!result.ok) {
        toast.error(result.error);
        setFeedback(suggestion.was_used);
      }
    });
  };

  const showThinking = !suggestion.is_complete && suggestion.content === '';

  return (
    <div
      className={cn(
        'relative animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-lg border bg-card shadow-sm transition-opacity duration-300',
        stale && 'opacity-60',
      )}
    >
      {/* Intent ribbon */}
      <div className={cn('h-1 w-full', visual.ribbon)} />
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[11px] font-semibold uppercase tracking-wider', visual.pill)}>
            {visual.label}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {!suggestion.is_complete ? (
              <span className="inline-flex items-center gap-1">
                <SparklesIcon className="size-3 animate-pulse" />
                streaming
              </span>
            ) : null}
            {stale ? <span>stale</span> : null}
          </div>
        </div>

        {showThinking ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ThinkingDots />
            <span>Thinking…</span>
          </div>
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-line text-foreground">
            {suggestion.content}
            {!suggestion.is_complete ? (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
            ) : null}
          </div>
        )}

        {suggestion.is_complete ? (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="xs"
              variant={feedback === true ? 'default' : 'outline'}
              onClick={() => send(true)}
              disabled={pending}
            >
              <CheckIcon /> Used
            </Button>
            <Button
              size="xs"
              variant={feedback === false ? 'destructive' : 'outline'}
              onClick={() => send(false)}
              disabled={pending}
            >
              <XIcon /> Dismiss
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}
