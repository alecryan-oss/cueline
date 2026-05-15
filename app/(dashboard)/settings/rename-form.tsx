'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { renameTenant, type SettingsActionState } from './actions';

export function RenameTenantForm({
  initialName,
  canEdit,
}: {
  initialName: string;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsActionState | undefined, FormData>(
    renameTenant,
    undefined,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={initialName}
          disabled={!canEdit}
          required
          maxLength={100}
        />
      </div>
      <Button type="submit" disabled={!canEdit || pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
