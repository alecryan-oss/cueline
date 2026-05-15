import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { ProspectChat } from '@/components/dev/ProspectChat';
import { ScriptPlayer } from '@/components/dev/ScriptPlayer';
import { VoiceProspectChat } from '@/components/dev/VoiceProspectChat';
import { LiveCallView } from '@/components/live/LiveCallView';
import { createServerClient } from '@/lib/db/client';
import { getCallById } from '@/lib/db/queries/calls';
import { listRecentCallEvents } from '@/lib/db/queries/callEvents';
import { listSuggestionsForCall } from '@/lib/db/queries/suggestions';
import {
  MOCK_TRANSCRIPT_NAMES,
  type MockTranscriptName,
} from '@/lib/dev/mockTranscripts';
import { env } from '@/lib/env';
import { requireTenant } from '@/lib/tenant/context';

type Props = {
  params: Promise<{ callId: string }>;
  searchParams: Promise<{ script?: string; ai?: string; voice?: string }>;
};

export default async function LiveCallPage({ params, searchParams }: Props) {
  const { callId } = await params;
  const { script, ai, voice } = await searchParams;

  const { tenantId } = await requireTenant();
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const call = await getCallById(supabase, tenantId, callId);
  if (!call) notFound();

  const [initialEvents, allSuggestions] = await Promise.all([
    listRecentCallEvents(supabase, tenantId, callId, 50),
    listSuggestionsForCall(supabase, tenantId, callId),
  ]);
  // listSuggestionsForCall returns oldest-first; the live view shows newest-first.
  const initialSuggestions = [...allSuggestions].reverse();

  const mockEnabled =
    env.NODE_ENV === 'development' && env.ENABLE_MOCK_CALLS === 'true';
  const validScript =
    mockEnabled && script && (MOCK_TRANSCRIPT_NAMES as readonly string[]).includes(script)
      ? (script as MockTranscriptName)
      : null;
  const aiMode = mockEnabled && ai === 'true';
  const voiceMode = mockEnabled && voice === 'true';

  return (
    <>
      <LiveCallView
        call={call}
        initialEvents={initialEvents}
        initialSuggestions={initialSuggestions}
        canEndCall={mockEnabled}
      />
      {validScript ? (
        <ScriptPlayer callId={call.id} scriptName={validScript} />
      ) : voiceMode ? (
        <VoiceProspectChat callId={call.id} />
      ) : aiMode ? (
        <ProspectChat callId={call.id} />
      ) : null}
    </>
  );
}
