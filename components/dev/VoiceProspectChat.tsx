'use client';

import { MicIcon, MicOffIcon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { sendProspectMessage } from '@/app/(live)/call/[callId]/prospect-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Browser SpeechRecognition is vendor-prefixed in some engines and not typed
// in lib.dom — declare a minimal shape so we can use it without `any`.
type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>;
  resultIndex: number;
};
type SpeechRecognitionErrorEvent = { error: string; message: string };
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function VoiceProspectChat({
  callId,
  scenario,
  scenarioLabel,
}: {
  callId: string;
  scenario?: string;
  scenarioLabel?: string;
}) {
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [interim, setInterim] = useState('');
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = (text: string) => {
    if (muted || typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    // Prefer a natural-sounding English voice if available.
    const preferred =
      voices.find((v) => v.lang.startsWith('en') && /natural|neural|premium/i.test(v.name)) ??
      voices.find((v) => v.lang.startsWith('en')) ??
      voices[0];
    if (preferred) u.voice = preferred;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setInterim('');
    startTransition(async () => {
      const result = await sendProspectMessage(callId, message, scenario);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.fullText) speak(result.fullText);
    });
  };

  const startListening = () => {
    if (pending || listening) return;
    const SR = getSpeechRecognition();
    if (!SR) {
      toast.error('Speech recognition is not supported in this browser. Use Chrome or Edge.');
      return;
    }
    // Cancel any in-progress prospect TTS before opening the mic so the model
    // doesn't transcribe its own output.
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();

    const r = new SR();
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = true;

    let finalTranscript = '';
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const alt = result[0];
        if (!alt) continue;
        const isFinal = (result as unknown as { isFinal: boolean }).isFinal;
        if (isFinal) {
          finalTranscript += alt.transcript;
        } else {
          interimText += alt.transcript;
        }
      }
      setInterim(interimText);
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        toast.error(`Mic error: ${e.error}`);
      }
    };
    r.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (finalTranscript.trim()) submit(finalTranscript);
    };
    try {
      r.start();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start mic');
      setListening(false);
      return;
    }
    recognitionRef.current = r;
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  const toggleListening = () => (listening ? stopListening() : startListening());
  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (next && typeof window !== 'undefined') window.speechSynthesis?.cancel();
      return next;
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-xs font-medium">
            <span className="text-muted-foreground">
              {scenarioLabel ? 'Training:' : 'Voice prospect'}
            </span>
            {scenarioLabel ? <span className="ml-1">{scenarioLabel}</span> : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {!supported
              ? 'Mic not supported (use Chrome/Edge)'
              : listening
                ? 'Listening…'
                : pending
                  ? 'Prospect responding…'
                  : 'Click mic to talk'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute prospect' : 'Mute prospect'}
            title={muted ? 'Unmute prospect voice' : 'Mute prospect voice'}
          >
            {muted ? <VolumeXIcon /> : <Volume2Icon />}
          </Button>
        </div>
      </div>
      <div className="space-y-2 p-3">
        <Button
          onClick={toggleListening}
          disabled={!supported || pending}
          className="w-full"
          variant={listening ? 'destructive' : 'default'}
        >
          {listening ? (
            <>
              <MicOffIcon /> Stop & send
            </>
          ) : (
            <>
              <MicIcon /> {pending ? 'Wait for prospect…' : 'Speak'}
            </>
          )}
        </Button>
        {interim ? (
          <div className="rounded border bg-muted/30 p-2 text-xs">
            <Badge variant="secondary" className="mr-1 text-[10px]">
              hearing
            </Badge>
            <span className="italic">{interim}</span>
          </div>
        ) : null}
        <p className="text-[10px] text-muted-foreground">
          Click <strong>Speak</strong>, talk, then click <strong>Stop &amp; send</strong>. The
          prospect&apos;s reply plays through your speakers and lands in the transcript. Mute the
          speaker icon if you only want suggestions, no audio.
        </p>
      </div>
    </div>
  );
}
