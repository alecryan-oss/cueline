'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createServerClient, createServiceClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export type AuthActionState = {
  ok: boolean;
  error?: string;
  message?: string;
};

const CredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function signUp(
  _prev: AuthActionState | undefined,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const { data: signed, error: signUpErr } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (signUpErr || !signed.user) {
    logger.warn({ err: signUpErr?.message }, 'sign-up failed');
    return { ok: false, error: signUpErr?.message ?? 'Sign-up failed' };
  }

  // Provision the tenant + owner membership using the service role. RLS
  // forbids client inserts on `tenants` and `tenant_members`; this is the one
  // sanctioned bypass per docs/multi-tenancy.md.
  const userId = signed.user.id;
  const service = createServiceClient();

  const { data: tenant, error: tenantErr } = await service
    .from('tenants')
    .insert({ name: `${parsed.data.email}'s workspace` })
    .select('id')
    .single();
  if (tenantErr || !tenant) {
    logger.error({ err: tenantErr?.message, userId }, 'tenant provisioning failed');
    return { ok: false, error: 'Failed to create workspace. Try again.' };
  }

  const { error: memberErr } = await service.from('tenant_members').insert({
    user_id: userId,
    tenant_id: tenant.id,
    role: 'owner',
  });
  if (memberErr) {
    logger.error(
      { err: memberErr.message, userId, tenantId: tenant.id },
      'tenant_members insert failed',
    );
    return { ok: false, error: 'Failed to attach you to your new workspace.' };
  }

  if (signed.session) {
    redirect('/');
  }
  return {
    ok: true,
    message: 'Account created. Check your email for a confirmation link, then sign in.',
  };
}

export async function signIn(
  _prev: AuthActionState | undefined,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: error.message };
  }
  redirect('/');
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  await supabase.auth.signOut();
  redirect('/sign-in');
}
