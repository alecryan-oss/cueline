'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { createServerClient, createServiceClient } from '@/lib/db/client';
import { getCallById, insertCall, updateCall } from '@/lib/db/queries/calls';
import { insertCallEvent } from '@/lib/db/queries/callEvents';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireTenant } from '@/lib/tenant/context';
import { MOCK_TRANSCRIPT_NAMES, type MockTranscriptName } from '@/lib/dev/mockTranscripts';

function ensureMockEnabled() {
  if (env.NODE_ENV !== 'development' || env.ENABLE_MOCK_CALLS !== 'true') {
    throw new Error('Mock calls are not enabled in this environment.');
  }
}

const CALL_TYPES = [
  'discovery',
  'sales_pitch',
  'demo',
  'follow_up',
  'negotiation',
  'closing',
] as const;
type CallType = (typeof CALL_TYPES)[number];

const SetupSchema = z.object({
  call_type: z.enum(CALL_TYPES).optional(),
  goal: z.string().trim().max(500).optional(),
});

function extractSetup(formData: FormData): { call_type: CallType | null; goal: string | null } {
  const parsed = SetupSchema.safeParse({
    call_type: formData.get('call_type')?.toString() || undefined,
    goal: formData.get('goal')?.toString() || undefined,
  });
  if (!parsed.success) return { call_type: null, goal: null };
  return {
    call_type: parsed.data.call_type ?? null,
    goal: parsed.data.goal && parsed.data.goal.length > 0 ? parsed.data.goal : null,
  };
}

export async function startBlankMockCall(formData: FormData): Promise<void> {
  ensureMockEnabled();
  const { userId, tenantId } = await requireTenant();
  const setup = extractSetup(formData);
  const service = createServiceClient();

  const call = await insertCall(service, tenantId, {
    dialpad_call_id: `mock-${nanoid(12)}`,
    agent_user_id: userId,
    started_at: new Date().toISOString(),
    status: 'active',
    call_type: setup.call_type,
    goal: setup.goal,
  });

  revalidatePath('/calls/simulate');
  redirect(`/call/${call.id}`);
}

export async function startAiProspectCall(formData: FormData): Promise<void> {
  ensureMockEnabled();
  const { userId, tenantId } = await requireTenant();
  const setup = extractSetup(formData);
  const service = createServiceClient();

  const call = await insertCall(service, tenantId, {
    dialpad_call_id: `mock-${nanoid(12)}`,
    agent_user_id: userId,
    started_at: new Date().toISOString(),
    status: 'active',
    call_type: setup.call_type,
    goal: setup.goal,
  });

  revalidatePath('/calls/simulate');
  redirect(`/call/${call.id}?ai=true`);
}

export async function startVoiceProspectCall(formData: FormData): Promise<void> {
  ensureMockEnabled();
  const { userId, tenantId } = await requireTenant();
  const setup = extractSetup(formData);
  const service = createServiceClient();

  const call = await insertCall(service, tenantId, {
    dialpad_call_id: `mock-${nanoid(12)}`,
    agent_user_id: userId,
    started_at: new Date().toISOString(),
    status: 'active',
    call_type: setup.call_type,
    goal: setup.goal,
  });

  revalidatePath('/calls/simulate');
  redirect(`/call/${call.id}?voice=true`);
}

const TrainingSchema = z.object({
  scenario: z.string().min(1).max(64),
  mode: z.enum(['text', 'voice']).default('text'),
});

export async function startTrainingCall(formData: FormData): Promise<void> {
  ensureMockEnabled();
  const trainingParsed = TrainingSchema.safeParse({
    scenario: formData.get('scenario'),
    mode: formData.get('mode')?.toString() || undefined,
  });
  if (!trainingParsed.success) {
    throw new Error('Pick a training scenario');
  }
  const { userId, tenantId } = await requireTenant();
  const setup = extractSetup(formData);
  const service = createServiceClient();

  const call = await insertCall(service, tenantId, {
    dialpad_call_id: `mock-${nanoid(12)}`,
    agent_user_id: userId,
    started_at: new Date().toISOString(),
    status: 'active',
    call_type: setup.call_type,
    goal: setup.goal,
  });

  const params = new URLSearchParams({
    train: trainingParsed.data.scenario,
  });
  if (trainingParsed.data.mode === 'voice') params.set('voice', 'true');
  else params.set('ai', 'true');

  revalidatePath('/calls/simulate');
  redirect(`/call/${call.id}?${params.toString()}`);
}

const ScriptSchema = z.object({
  script: z.enum(MOCK_TRANSCRIPT_NAMES as [MockTranscriptName, ...MockTranscriptName[]]),
});

export async function startScriptedMockCall(formData: FormData): Promise<void> {
  ensureMockEnabled();
  const parsed = ScriptSchema.safeParse({ script: formData.get('script') });
  if (!parsed.success) {
    throw new Error('Unknown script');
  }
  const setup = extractSetup(formData);

  const { userId, tenantId } = await requireTenant();
  const service = createServiceClient();

  const call = await insertCall(service, tenantId, {
    dialpad_call_id: `mock-${nanoid(12)}`,
    agent_user_id: userId,
    started_at: new Date().toISOString(),
    status: 'active',
    call_type: setup.call_type,
    goal: setup.goal,
  });

  revalidatePath('/calls/simulate');
  redirect(`/call/${call.id}?script=${encodeURIComponent(parsed.data.script)}`);
}

const InjectSchema = z.object({
  callId: z.string().uuid(),
  speaker: z.enum(['operator', 'contact']),
  text: z.string().min(1).max(2000),
});

export type InjectResult = { ok: true; eventId: number } | { ok: false; error: string };

export async function injectMockEvent(input: {
  callId: string;
  speaker: 'operator' | 'contact';
  text: string;
}): Promise<InjectResult> {
  ensureMockEnabled();

  const parsed = InjectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { tenantId } = await requireTenant();

  const cookieStore = await cookies();
  const sessionClient = createServerClient(cookieStore);
  const service = createServiceClient();

  const call = await getCallById(sessionClient, tenantId, parsed.data.callId);
  if (!call) {
    return { ok: false, error: 'Call not found in this tenant.' };
  }

  let event;
  try {
    event = await insertCallEvent(service, tenantId, {
      call_id: call.id,
      speaker: parsed.data.speaker,
      text: parsed.data.text,
      occurred_at: new Date().toISOString(),
      event_state: 'call_transcription',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, tenantId, callId: call.id }, 'injectMockEvent insert failed');
    return { ok: false, error: msg };
  }

  if (parsed.data.speaker === 'contact') {
    const url = `${env.NEXT_PUBLIC_APP_URL}/api/suggest`;
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': env.SUGGEST_INTERNAL_SECRET,
      },
      body: JSON.stringify({ callId: call.id, eventId: event.id }),
    }).catch((err) => {
      logger.debug(
        { err: err instanceof Error ? err.message : String(err), callId: call.id, eventId: event.id },
        'fire-and-forget /api/suggest POST failed',
      );
    });
  }

  return { ok: true, eventId: event.id };
}

export async function endMockCall(callId: string): Promise<{ ok: boolean; error?: string }> {
  ensureMockEnabled();
  const { tenantId } = await requireTenant();

  const cookieStore = await cookies();
  const sessionClient = createServerClient(cookieStore);
  const service = createServiceClient();

  const call = await getCallById(sessionClient, tenantId, callId);
  if (!call) return { ok: false, error: 'Call not found in this tenant.' };

  try {
    await updateCall(service, tenantId, callId, {
      status: 'ended',
      ended_at: new Date().toISOString(),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath('/calls/simulate');
  revalidatePath(`/call/${callId}`);
  return { ok: true };
}
