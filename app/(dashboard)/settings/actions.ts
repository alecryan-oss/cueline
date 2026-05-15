'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { requireTenant } from '@/lib/tenant/context';

export type SettingsActionState = {
  ok: boolean;
  error?: string;
  message?: string;
};

const RenameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Workspace name cannot be empty')
    .max(100, 'Workspace name must be 100 characters or fewer'),
});

export async function renameTenant(
  _prev: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState> {
  const { tenantId, role } = await requireTenant();
  if (role !== 'owner') {
    return { ok: false, error: 'Only the workspace owner can rename it.' };
  }

  const parsed = RenameSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const { error } = await supabase
    .from('tenants')
    .update({ name: parsed.data.name })
    .eq('id', tenantId);

  if (error) {
    logger.error({ err: error.message, tenantId }, 'tenant rename failed');
    return { ok: false, error: error.message };
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Workspace renamed.' };
}
