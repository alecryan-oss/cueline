'use client';

import { Trash2Icon } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { deleteChunk, type KbActionState } from './actions';

export function DeleteChunkButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<KbActionState | undefined, FormData>(
    deleteChunk,
    undefined,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="icon-sm" disabled={pending} aria-label="Delete chunk">
        <Trash2Icon />
      </Button>
    </form>
  );
}
